var io = require('socket.io-client');
var { ethers } = require('ethers');
var render = require('./render');
var ChatClient = require('./chat-client');
var Canvas = require('./canvas');
var global = require('./global');
require('./wallet'); // Import wallet to bundle it and initialize window.walletManager

var playerNameInput = document.getElementById('playerNameInput');
var socket;

var debug = function (args) {
    if (console && console.log) {
        console.log(args);
    }
};

if (/Android|webOS|iPhone|iPad|iPod|BlackBerry/i.test(navigator.userAgent)) {
    global.mobile = true;
}

function startGame(type) {
    global.playerName = playerNameInput.value.replace(/(<([^>]+)>)/ig, '').substring(0, 25);
    global.playerType = type;

    global.screen.width = window.innerWidth;
    global.screen.height = window.innerHeight;

    document.getElementById('startMenuWrapper').style.maxHeight = '0px';
    document.getElementById('gameAreaWrapper').style.opacity = 1;
    if (!socket) {
        socket = io({ query: "type=" + type });
        setupSocket(socket);
    }
    if (global.depositConfirmed && global.depositAddress) {
        socket.emit('playerDepositConfirmed', {
            address: global.depositAddress,
            txHash: global.depositTxHash,
            lobbyId: global.depositLobbyId
        });
    }
    if (!global.animLoopHandle)
        animloop();
    socket.emit('respawn');
    window.chat.socket = socket;
    window.chat.registerFunctions();
    window.canvas.socket = socket;
    global.socket = socket;
}

// Checks if the nick chosen contains valid alphanumeric characters (and underscores).
function validNick() {
    var regex = /^\w*$/;
    debug('Regex Test', regex.exec(playerNameInput.value));
    return regex.exec(playerNameInput.value) !== null;
}

window.onload = function () {

    var btn = document.getElementById('startButton'),
        btnS = document.getElementById('spectateButton'),
        nickErrorText = document.querySelector('#startMenu .input-error');

    btnS.onclick = function () {
        startGame('spectator');
    };

    btn.onclick = function () {
        if (!global.depositConfirmed) {
            alert('Please join a lobby first by depositing 1 USDC.');
            return;
        }

        // Checks if the nick is valid.
        if (validNick()) {
            nickErrorText.style.opacity = 0;
            startGame('player');
        } else {
            nickErrorText.style.opacity = 1;
        }
    };

    var settingsMenu = document.getElementById('settingsButton');
    var settings = document.getElementById('settings');

    settingsMenu.onclick = function () {
        if (settings.style.maxHeight == '300px') {
            settings.style.maxHeight = '0px';
        } else {
            settings.style.maxHeight = '300px';
        }
    };

    playerNameInput.addEventListener('keypress', function (e) {
        var key = e.which || e.keyCode;

        if (key === global.KEY_ENTER) {
            if (!global.depositConfirmed) {
                alert('Please join a lobby first by depositing 1 USDC.');
                return;
            }
            if (validNick()) {
                nickErrorText.style.opacity = 0;
                startGame('player');
            } else {
                nickErrorText.style.opacity = 1;
            }
        }
    });

    // Wallet and deposit functionality
    initWalletUI();
};

// Wallet and deposit functionality
var currentLobbyId = null;
var usdcAddress = null; // Will be set from config
var betLobbyAddress = null; // Will be set from config
var depositAmount = 1000000; // 1 USDC (6 decimals)

// Fetch config from server
async function loadConfig() {
    try {
        const response = await fetch('/api/config');
        const config = await response.json();
        usdcAddress = config.usdcAddress;
        betLobbyAddress = config.betLobbyAddress;
        console.log('[Config] Loaded:', config);
        
        if (!usdcAddress || !betLobbyAddress) {
            console.warn('[Config] Missing addresses - USDC:', usdcAddress, 'BetLobby:', betLobbyAddress);
        }
        
        return true;
    } catch (error) {
        console.error('[Config] Error loading config:', error);
        return false;
    }
}

// Load config on page load
var configLoaded = false;
if (typeof window !== 'undefined') {
    window.addEventListener('load', async () => {
        configLoaded = await loadConfig();
    });
}

// Ensure config is loaded (with retry)
async function ensureConfigLoaded() {
    if (configLoaded && usdcAddress && betLobbyAddress) {
        return true;
    }
    
    // Try to load config if not loaded
    if (!configLoaded) {
        configLoaded = await loadConfig();
    }
    
    // If still not loaded, wait a bit and retry
    if (!configLoaded || !usdcAddress || !betLobbyAddress) {
        console.log('[Config] Waiting for config...');
        await new Promise(resolve => setTimeout(resolve, 500));
        configLoaded = await loadConfig();
    }
    
    return configLoaded && usdcAddress && betLobbyAddress;
}

// USDC ABI (minimal)
var USDC_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)"
];

// BetLobby ABI (minimal)
var BET_LOBBY_ABI = [
    "function joinLobby(uint256 lobbyId) external",
    "function hasDeposited(uint256 lobbyId, address player) external view returns (bool)",
    "event LobbyFinalized(uint256 indexed lobbyId, uint96 totalPayout, uint96 feeAmount)"
];

function initWalletUI() {
    var connectBtn = document.getElementById('connectWalletBtn');
    var approveBtn = document.getElementById('approveUsdcBtn');
    var joinBtn = document.getElementById('joinLobbyBtn');
    var walletStatus = document.getElementById('walletStatus');
    var walletAddress = document.getElementById('walletAddress');
    var walletError = document.getElementById('walletError');

    // Start menu wallet buttons
    var menuConnectBtn = document.getElementById('menuConnectBtn');
    var menuApproveBtn = document.getElementById('menuApproveBtn');
    var menuJoinBtn = document.getElementById('menuJoinBtn');
    var menuWalletStatus = document.getElementById('menuWalletStatus');
    var menuWalletError = document.getElementById('menuWalletError');
    var startButton = document.getElementById('startButton');

    // Check if wallet is available
    if (!window.walletManager || !window.walletManager.isWalletAvailable()) {
        if (walletStatus) walletStatus.textContent = 'No wallet detected';
        if (menuWalletStatus) menuWalletStatus.textContent = 'No wallet detected';
        return;
    }

    connectBtn.style.display = 'block';
    connectBtn.onclick = async function() {
        try {
            walletError.style.display = 'none';
            
            var address = await window.walletManager.connectWallet();
            
            // Switch to Base Sepolia
            if (!window.walletManager.isOnCorrectNetwork()) {
                await window.walletManager.switchToBaseSepolia();
            }

            walletStatus.textContent = 'Connected';
            walletAddress.textContent = address.substring(0, 6) + '...' + address.substring(38);
            walletAddress.style.display = 'block';
            connectBtn.style.display = 'none';
            
            // Ensure config is loaded before checking allowance
            var configReady = await ensureConfigLoaded();
            if (!configReady) {
                walletError.textContent = 'Failed to load contract addresses. Please refresh the page.';
                walletError.style.display = 'block';
                return;
            }
            
            // Check USDC allowance
            await checkAllowance();
            
            // Check if already deposited
            await checkDepositStatus();
        } catch (error) {
            walletError.textContent = error.message;
            walletError.style.display = 'block';
        }
    };

    approveBtn.onclick = async function() {
        try {
            walletError.style.display = 'none';
            approveBtn.disabled = true;
            approveBtn.textContent = 'Approving...';
            
            // Get USDC contract (address should be set from server config)
            if (!usdcAddress) {
                throw new Error('USDC address not configured');
            }
            
            var provider = window.walletManager.getProvider();
            var signer = await window.walletManager.getSigner();
            var usdcContract = new ethers.Contract(usdcAddress, USDC_ABI, signer);
            
            // Approve 1 USDC
            var tx = await usdcContract.approve(betLobbyAddress, depositAmount);
            await tx.wait();
            
            approveBtn.textContent = 'Approved';
            await checkAllowance();
        } catch (error) {
            walletError.textContent = error.message;
            walletError.style.display = 'block';
            approveBtn.disabled = false;
            approveBtn.textContent = 'Approve 1 USDC';
        }
    };

    joinBtn.onclick = async function() {
        try {
            walletError.style.display = 'none';
            joinBtn.disabled = true;
            joinBtn.textContent = 'Joining...';
            
            if (!betLobbyAddress) {
                throw new Error('BetLobby address not configured');
            }
            
            // Get current lobby ID (deterministic)
            var lobbyDurationMs = 300000; // 5 minutes
            currentLobbyId = Math.floor(Date.now() / lobbyDurationMs);
            
            var signer = await window.walletManager.getSigner();
            var betLobbyContract = new ethers.Contract(betLobbyAddress, BET_LOBBY_ABI, signer);
            
            // Join lobby
            var tx = await betLobbyContract.joinLobby(currentLobbyId);
            var receipt = await tx.wait();
            
            joinBtn.textContent = 'Joined!';
            walletStatus.textContent = 'Deposit confirmed';
            global.depositConfirmed = true; // Enable play button
            global.depositAddress = await signer.getAddress();
            global.depositTxHash = receipt.transactionHash;
            global.depositLobbyId = currentLobbyId;
            
            // Emit to server
            if (socket) {
                socket.emit('playerDepositConfirmed', {
                    address: await signer.getAddress(),
                    txHash: receipt.transactionHash,
                    lobbyId: currentLobbyId
                });
            }
        } catch (error) {
            walletError.textContent = error.message;
            walletError.style.display = 'block';
            joinBtn.disabled = false;
            joinBtn.textContent = 'Join Lobby (1 USDC)';
        }
    };

    // START MENU WALLET BUTTONS
    if (menuConnectBtn) {
        menuConnectBtn.onclick = async function() {
            try {
                if (menuWalletError) menuWalletError.style.display = 'none';
                menuConnectBtn.disabled = true;
                menuConnectBtn.textContent = 'Connecting...';
                
                var address = await window.walletManager.connectWallet();
                
                // Switch to Base Sepolia
                if (!window.walletManager.isOnCorrectNetwork()) {
                    await window.walletManager.switchToBaseSepolia();
                }

                if (menuWalletStatus) {
                    menuWalletStatus.textContent = 'Connected: ' + address.substring(0, 6) + '...' + address.substring(38);
                }
                menuConnectBtn.style.display = 'none';
                
                // Ensure config is loaded before checking allowance
                var configReady = await ensureConfigLoaded();
                if (!configReady) {
                    if (menuWalletError) {
                        menuWalletError.textContent = 'Failed to load contract addresses. Please refresh the page.';
                        menuWalletError.style.display = 'block';
                    }
                    menuConnectBtn.disabled = false;
                    menuConnectBtn.textContent = 'Connect Wallet';
                    menuConnectBtn.style.display = 'block';
                    return;
                }
                
                // Check USDC allowance
                await checkAllowanceMenu();
                
                // Check if already deposited
                await checkDepositStatus();
            } catch (error) {
                if (menuWalletError) {
                    menuWalletError.textContent = error.message;
                    menuWalletError.style.display = 'block';
                }
                menuConnectBtn.disabled = false;
                menuConnectBtn.textContent = 'Connect Wallet';
            }
        };
    }

    if (menuApproveBtn) {
        menuApproveBtn.onclick = async function() {
            try {
                if (menuWalletError) menuWalletError.style.display = 'none';
                menuApproveBtn.disabled = true;
                menuApproveBtn.textContent = 'Approving...';
                
                if (!usdcAddress) {
                    throw new Error('USDC address not configured');
                }
                
                var signer = await window.walletManager.getSigner();
                var usdcContract = new ethers.Contract(usdcAddress, USDC_ABI, signer);
                
                // Approve 1 USDC
                var tx = await usdcContract.approve(betLobbyAddress, depositAmount);
                await tx.wait();
                
                menuApproveBtn.textContent = 'Approved ✓';
                await checkAllowanceMenu();
            } catch (error) {
                if (menuWalletError) {
                    menuWalletError.textContent = error.message;
                    menuWalletError.style.display = 'block';
                }
                menuApproveBtn.disabled = false;
                menuApproveBtn.textContent = 'Approve 1 USDC';
            }
        };
    }

    if (menuJoinBtn) {
        menuJoinBtn.onclick = async function() {
            try {
                if (menuWalletError) menuWalletError.style.display = 'none';
                menuJoinBtn.disabled = true;
                menuJoinBtn.textContent = 'Joining...';
                
                if (!betLobbyAddress) {
                    throw new Error('BetLobby address not configured');
                }
                
                // Get current lobby ID (deterministic)
                var lobbyDurationMs = 300000; // 5 minutes
                currentLobbyId = Math.floor(Date.now() / lobbyDurationMs);
                
                var signer = await window.walletManager.getSigner();
                var betLobbyContract = new ethers.Contract(betLobbyAddress, BET_LOBBY_ABI, signer);
                
                // Join lobby
                var tx = await betLobbyContract.joinLobby(currentLobbyId);
                var receipt = await tx.wait();
                
                menuJoinBtn.style.display = 'none';
                if (menuWalletStatus) menuWalletStatus.textContent = 'Deposit Confirmed ✓';
                if (startButton) {
                    startButton.disabled = false;
                    startButton.textContent = 'Play';
                }
                
                global.depositConfirmed = true;
                global.depositAddress = await signer.getAddress();
                global.depositTxHash = receipt.transactionHash;
                global.depositLobbyId = currentLobbyId;
                
                // Emit to server
                if (socket) {
                    socket.emit('playerDepositConfirmed', {
                        address: await signer.getAddress(),
                        txHash: receipt.transactionHash,
                        lobbyId: currentLobbyId
                    });
                }
            } catch (error) {
                if (menuWalletError) {
                    menuWalletError.textContent = error.message;
                    menuWalletError.style.display = 'block';
                }
                menuJoinBtn.disabled = false;
                menuJoinBtn.textContent = 'Join Lobby (1 USDC)';
            }
        };
    }
}

async function checkAllowance() {
    try {
        if (!window.walletManager || !window.walletManager.isConnected) {
            console.log('[Wallet] Not connected, skipping allowance check');
            return;
        }
        
        if (!usdcAddress || !betLobbyAddress) {
            console.warn('[Wallet] Contract addresses not set. USDC:', usdcAddress, 'BetLobby:', betLobbyAddress);
            // Show error to user
            var walletError = document.getElementById('walletError');
            if (walletError) {
                walletError.textContent = 'Contract addresses not configured. Please refresh the page.';
                walletError.style.display = 'block';
            }
            return;
        }
        
        var provider = window.walletManager.getProvider();
        var signer = await window.walletManager.getSigner();
        var address = await signer.getAddress();
        var usdcContract = new ethers.Contract(usdcAddress, USDC_ABI, provider);
        
        var allowance = await usdcContract.allowance(address, betLobbyAddress);
        
        var approveBtn = document.getElementById('approveUsdcBtn');
        var joinBtn = document.getElementById('joinLobbyBtn');
        
        console.log('[Wallet] Allowance check:', allowance.toString(), 'Required:', depositAmount);
        
        if (allowance.lt(depositAmount)) {
            console.log('[Wallet] Showing Approve button');
            if (approveBtn) approveBtn.style.display = 'block';
            if (joinBtn) joinBtn.style.display = 'none';
        } else {
            console.log('[Wallet] Showing Join button');
            if (approveBtn) approveBtn.style.display = 'none';
            if (joinBtn) joinBtn.style.display = 'block';
        }
    } catch (error) {
        console.error('[Wallet] Error checking allowance:', error);
        // Show error to user
        var walletError = document.getElementById('walletError');
        if (walletError) {
            walletError.textContent = 'Error checking allowance: ' + error.message;
            walletError.style.display = 'block';
        }
    }
}

async function checkAllowanceMenu() {
    try {
        if (!window.walletManager || !window.walletManager.isConnected) {
            console.log('[Wallet] Not connected, skipping allowance check');
            return;
        }
        
        if (!usdcAddress || !betLobbyAddress) {
            console.warn('[Wallet] Contract addresses not set. USDC:', usdcAddress, 'BetLobby:', betLobbyAddress);
            // Show error to user
            var menuWalletError = document.getElementById('menuWalletError');
            if (menuWalletError) {
                menuWalletError.textContent = 'Contract addresses not configured. Please refresh the page.';
                menuWalletError.style.display = 'block';
            }
            return;
        }
        
        var provider = window.walletManager.getProvider();
        var signer = await window.walletManager.getSigner();
        var address = await signer.getAddress();
        var usdcContract = new ethers.Contract(usdcAddress, USDC_ABI, provider);
        
        var allowance = await usdcContract.allowance(address, betLobbyAddress);
        
        var menuApproveBtn = document.getElementById('menuApproveBtn');
        var menuJoinBtn = document.getElementById('menuJoinBtn');
        
        console.log('[Wallet] Allowance check:', allowance.toString(), 'Required:', depositAmount);
        
        if (allowance.lt(depositAmount)) {
            console.log('[Wallet] Showing Approve button');
            if (menuApproveBtn) menuApproveBtn.style.display = 'block';
            if (menuJoinBtn) menuJoinBtn.style.display = 'none';
        } else {
            console.log('[Wallet] Showing Join button');
            if (menuApproveBtn) menuApproveBtn.style.display = 'none';
            if (menuJoinBtn) menuJoinBtn.style.display = 'block';
        }
    } catch (error) {
        console.error('[Wallet] Error checking allowance (menu):', error);
        // Show error to user
        var menuWalletError = document.getElementById('menuWalletError');
        if (menuWalletError) {
            menuWalletError.textContent = 'Error checking allowance: ' + error.message;
            menuWalletError.style.display = 'block';
        }
    }
}

async function checkDepositStatus() {
    try {
        if (!window.walletManager || !window.walletManager.isConnected) return;
        if (!betLobbyAddress) return;

        var lobbyDurationMs = 300000; // 5 minutes
        var currentLobbyId = Math.floor(Date.now() / lobbyDurationMs);

        var signer = await window.walletManager.getSigner();
        var address = await signer.getAddress();
        var betLobbyContract = new ethers.Contract(betLobbyAddress, BET_LOBBY_ABI, signer);

        var deposited = await betLobbyContract.hasDeposited(currentLobbyId, address);
        
        if (deposited) {
            var menuJoinBtn = document.getElementById('menuJoinBtn');
            var menuWalletStatus = document.getElementById('menuWalletStatus');
            var startButton = document.getElementById('startButton');
            
            if (menuJoinBtn) menuJoinBtn.style.display = 'none';
            if (menuWalletStatus) menuWalletStatus.textContent = 'Deposit Confirmed ✓';
            if (startButton) {
                startButton.disabled = false;
                startButton.textContent = 'Play';
            }
            
            global.depositConfirmed = true;
            global.depositAddress = address;
            global.depositTxHash = 'reconnect';
            global.depositLobbyId = currentLobbyId;
            
            // Emit to server to reconnect socket/player session
            if (socket) {
                socket.emit('playerDepositConfirmed', {
                    address: address,
                    txHash: 'reconnect', // Special flag or just ignore on server side if validation passes
                    lobbyId: currentLobbyId
                });
            }
        }
    } catch (error) {
        console.error('[Wallet] Error checking deposit status:', error);
    }
}

// TODO: Break out into GameControls.

var playerConfig = {
    border: 6,
    textColor: '#FFFFFF',
    textBorder: '#000000',
    textBorderSize: 3,
    defaultSize: 30
};

var player = {
    id: -1,
    x: global.screen.width / 2,
    y: global.screen.height / 2,
    screenWidth: global.screen.width,
    screenHeight: global.screen.height,
    target: { x: global.screen.width / 2, y: global.screen.height / 2 }
};
global.player = player;

var foods = [];
var viruses = [];
var fireFood = [];
var users = [];
var leaderboard = [];
var target = { x: player.x, y: player.y };
global.target = target;

window.canvas = new Canvas();
window.chat = new ChatClient();

var visibleBorderSetting = document.getElementById('visBord');
visibleBorderSetting.onchange = settings.toggleBorder;

var showMassSetting = document.getElementById('showMass');
showMassSetting.onchange = settings.toggleMass;

var continuitySetting = document.getElementById('continuity');
continuitySetting.onchange = settings.toggleContinuity;

var roundFoodSetting = document.getElementById('roundFood');
roundFoodSetting.onchange = settings.toggleRoundFood;

var c = window.canvas.cv;
var graph = c.getContext('2d');

$("#feed").click(function () {
    socket.emit('1');
    window.canvas.reenviar = false;
});

$("#split").click(function () {
    socket.emit('2');
    window.canvas.reenviar = false;
});

function handleDisconnect() {
    socket.close();
    if (!global.kicked) { // We have a more specific error message 
        render.drawErrorMessage('Disconnected!', graph, global.screen);
    }
}

// socket stuff.
function setupSocket(socket) {
    // Handle ping.
    socket.on('pongcheck', function () {
        var latency = Date.now() - global.startPingTime;
        debug('Latency: ' + latency + 'ms');
        window.chat.addSystemLine('Ping: ' + latency + 'ms');
    });

    // Handle error.
    socket.on('connect_error', handleDisconnect);
    socket.on('disconnect', handleDisconnect);

    // Handle connection.
    socket.on('welcome', function (playerSettings, gameSizes) {
        player = playerSettings;
        player.name = global.playerName;
        player.screenWidth = global.screen.width;
        player.screenHeight = global.screen.height;
        player.target = window.canvas.target;
        global.player = player;
        window.chat.player = player;
        socket.emit('gotit', player);
        global.gameStart = true;
        window.chat.addSystemLine('Connected to the game!');
        window.chat.addSystemLine('Type <b>-help</b> for a list of commands.');
        if (global.mobile) {
            document.getElementById('gameAreaWrapper').removeChild(document.getElementById('chatbox'));
        }
        c.focus();
        global.game.width = gameSizes.width;
        global.game.height = gameSizes.height;
        resize();
        
        // Show game HUD if player has deposited
        var gameHUD = document.getElementById('gameHUD');
        if (gameHUD && window.walletManager && window.walletManager.isConnected) {
            gameHUD.style.display = 'block';
        }
    });

    socket.on('playerDied', (data) => {
        const player = isUnnamedCell(data.playerEatenName) ? 'An unnamed cell' : data.playerEatenName;
        //const killer = isUnnamedCell(data.playerWhoAtePlayerName) ? 'An unnamed cell' : data.playerWhoAtePlayerName;

        //window.chat.addSystemLine('{GAME} - <b>' + (player) + '</b> was eaten by <b>' + (killer) + '</b>');
        window.chat.addSystemLine('{GAME} - <b>' + (player) + '</b> was eaten');
    });

    socket.on('playerDisconnect', (data) => {
        window.chat.addSystemLine('{GAME} - <b>' + (isUnnamedCell(data.name) ? 'An unnamed cell' : data.name) + '</b> disconnected.');
    });

    socket.on('playerJoin', (data) => {
        window.chat.addSystemLine('{GAME} - <b>' + (isUnnamedCell(data.name) ? 'An unnamed cell' : data.name) + '</b> joined.');
    });

    socket.on('leaderboard', (data) => {
        leaderboard = data.leaderboard;
        var status = '<span class="title">Leaderboard</span>';
        for (var i = 0; i < leaderboard.length; i++) {
            status += '<br />';
            if (leaderboard[i].id == player.id) {
                if (leaderboard[i].name.length !== 0)
                    status += '<span class="me">' + (i + 1) + '. ' + leaderboard[i].name + "</span>";
                else
                    status += '<span class="me">' + (i + 1) + ". An unnamed cell</span>";
            } else {
                if (leaderboard[i].name.length !== 0)
                    status += (i + 1) + '. ' + leaderboard[i].name;
                else
                    status += (i + 1) + '. An unnamed cell';
            }
        }
        //status += '<br />Players: ' + data.players;
        document.getElementById('status').innerHTML = status;
    });

    socket.on('serverMSG', function (data) {
        window.chat.addSystemLine(data);
    });

    // Chat.
    socket.on('serverSendPlayerChat', function (data) {
        window.chat.addChatLine(data.sender, data.message, false);
    });

    // Handle movement.
    socket.on('serverTellPlayerMove', function (playerData, userData, foodsList, massList, virusList) {
        if (global.playerType == 'player') {
            player.x = playerData.x;
            player.y = playerData.y;
            player.hue = playerData.hue;
            player.massTotal = playerData.massTotal;
            player.cells = playerData.cells;
            // Store lobby ID for ghost mode rendering
            global.player.lobbyId = playerData.lobbyId || null;
        }
        users = userData;
        foods = foodsList;
        viruses = virusList;
        fireFood = massList;
    });

    // Death.
    socket.on('RIP', function () {
        global.gameStart = false;
        render.drawErrorMessage('You died!', graph, global.screen);
        window.setTimeout(() => {
            document.getElementById('gameAreaWrapper').style.opacity = 0;
            document.getElementById('startMenuWrapper').style.maxHeight = '1000px';
            if (global.animLoopHandle) {
                window.cancelAnimationFrame(global.animLoopHandle);
                global.animLoopHandle = undefined;
            }
        }, 2500);
    });

    socket.on('kick', function (reason) {
        global.gameStart = false;
        global.kicked = true;
        if (reason !== '') {
            render.drawErrorMessage('You were kicked for: ' + reason, graph, global.screen);
        }
        else {
            render.drawErrorMessage('You were kicked!', graph, global.screen);
        }
        socket.close();
    });

    // Lobby events
    socket.on('lobbyEndTime', function (data) {
        global.lobbyEndTime = data.endTime;
        global.lobbyStartTime = Date.now(); // Track start time for cash-out grace period
        // Start countdown timer
        if (global.lobbyEndTime) {
            updateLobbyTimer();
            setInterval(updateLobbyTimer, 1000);
        }
        
        // Enable cash-out button after grace period (45 seconds)
        setTimeout(() => {
            var cashOutBtn = document.getElementById('cashOutBtn');
            if (cashOutBtn) {
                cashOutBtn.disabled = false;
            }
        }, 45000); // 45 seconds
    });

    socket.on('lobbyFinalized', function (data) {
        console.log('[Lobby] Lobby finalized:', data);
        showResultsModal(data);
    });

    // Player balance updates
    socket.on('playerBalance', function (data) {
        global.playerBalance = data.balance;
        updateBalanceDisplay();
    });
}

// Lobby timer
var lobbyTimerInterval = null;
function updateLobbyTimer() {
    if (!global.lobbyEndTime) return;
    
    var now = Date.now();
    var remaining = Math.max(0, global.lobbyEndTime - now);
    var minutes = Math.floor(remaining / 60000);
    var seconds = Math.floor((remaining % 60000) / 1000);
    
    var timerEl = document.getElementById('lobbyTimer');
    if (timerEl) {
        timerEl.textContent = 'Time: ' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
    }
}

function updateBalanceDisplay() {
    var balanceEl = document.getElementById('playerBalance');
    if (balanceEl && global.playerBalance !== undefined) {
        var balanceUsdc = (global.playerBalance / 1000000).toFixed(2);
        balanceEl.textContent = 'Balance: ' + balanceUsdc + ' USDC';
    }
}

// Cash out button
var cashOutBtn = document.getElementById('cashOutBtn');
if (cashOutBtn) {
    cashOutBtn.onclick = function() {
        if (socket) {
            socket.emit('cashOutIntent');
            cashOutBtn.disabled = true;
            cashOutBtn.textContent = 'Cashing Out...';
        }
    };
}

// Results modal and claim
function showResultsModal(data) {
    var modal = document.getElementById('resultsModal');
    var finalBalance = document.getElementById('finalBalance');
    var claimBtn = document.getElementById('claimBtn');
    var claimStatus = document.getElementById('claimStatus');
    var closeBtn = document.getElementById('closeResultsBtn');

    if (finalBalance && data.balance !== undefined) {
        var balanceUsdc = (data.balance / 1000000).toFixed(2);
        finalBalance.textContent = 'Final Balance: ' + balanceUsdc + ' USDC';
    }

    modal.style.display = 'block';

    // Hide claim button as distribution is automatic
    if (claimBtn) {
        claimBtn.style.display = 'none';
    }
    
    if (claimStatus) {
        claimStatus.textContent = 'Rewards have been automatically distributed to your wallet.';
        if (data.txHash) {
            claimStatus.textContent += ' Tx: ' + data.txHash.substring(0, 10) + '...';
        }
    }

    closeBtn.onclick = function() {
        modal.style.display = 'none';
    };
}

const isUnnamedCell = (name) => name.length < 1;

const getPosition = (entity, player, screen) => {
    return {
        x: entity.x - player.x + screen.width / 2,
        y: entity.y - player.y + screen.height / 2
    }
}

window.requestAnimFrame = (function () {
    return window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame ||
        window.msRequestAnimationFrame ||
        function (callback) {
            window.setTimeout(callback, 1000 / 60);
        };
})();

window.cancelAnimFrame = (function (handle) {
    return window.cancelAnimationFrame ||
        window.mozCancelAnimationFrame;
})();

function animloop() {
    global.animLoopHandle = window.requestAnimFrame(animloop);
    gameLoop();
}

function gameLoop() {
    if (global.gameStart) {
        graph.fillStyle = global.backgroundColor;
        graph.fillRect(0, 0, global.screen.width, global.screen.height);

        render.drawGrid(global, player, global.screen, graph);
        foods.forEach(food => {
            let position = getPosition(food, player, global.screen);
            render.drawFood(position, food, graph);
        });
        fireFood.forEach(fireFood => {
            let position = getPosition(fireFood, player, global.screen);
            render.drawFireFood(position, fireFood, playerConfig, graph);
        });
        viruses.forEach(virus => {
            let position = getPosition(virus, player, global.screen);
            render.drawVirus(position, virus, graph);
        });


        let borders = { // Position of the borders on the screen
            left: global.screen.width / 2 - player.x,
            right: global.screen.width / 2 + global.game.width - player.x,
            top: global.screen.height / 2 - player.y,
            bottom: global.screen.height / 2 + global.game.height - player.y
        }
        if (global.borderDraw) {
            render.drawBorder(borders, graph);
        }

        var cellsToDraw = [];
        for (var i = 0; i < users.length; i++) {
            let color = 'hsl(' + users[i].hue + ', 100%, 50%)';
            let borderColor = 'hsl(' + users[i].hue + ', 100%, 45%)';
            for (var j = 0; j < users[i].cells.length; j++) {
                cellsToDraw.push({
                    color: color,
                    borderColor: borderColor,
                    mass: users[i].cells[j].mass,
                    name: users[i].name,
                    radius: users[i].cells[j].radius,
                    x: users[i].cells[j].x - player.x + global.screen.width / 2,
                    y: users[i].cells[j].y - player.y + global.screen.height / 2,
                    lobbyId: users[i].lobbyId || null // Include lobby ID for ghost mode
                });
            }
        }
        cellsToDraw.sort(function (obj1, obj2) {
            return obj1.mass - obj2.mass;
        });
        render.drawCells(cellsToDraw, playerConfig, global.toggleMassState, borders, graph, global.player.lobbyId);

        socket.emit('0', window.canvas.target); // playerSendTarget "Heartbeat".
    }
}

window.addEventListener('resize', resize);

function resize() {
    if (!socket) return;

    player.screenWidth = c.width = global.screen.width = global.playerType == 'player' ? window.innerWidth : global.game.width;
    player.screenHeight = c.height = global.screen.height = global.playerType == 'player' ? window.innerHeight : global.game.height;

    if (global.playerType == 'spectator') {
        player.x = global.game.width / 2;
        player.y = global.game.height / 2;
    }

    socket.emit('windowResized', { screenWidth: global.screen.width, screenHeight: global.screen.height });
}

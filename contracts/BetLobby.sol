// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title BetLobby
 * @dev Trustless wagering contract for Agar.io-style game lobbies
 * Players deposit 1 USDC, play 5-minute lobbies, and claim winnings via Merkle proofs
 */
contract BetLobby is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Constants
    uint256 public constant DEPOSIT_AMOUNT = 1e6; // 1 USDC (6 decimals)
    uint256 public constant LOBBY_DURATION = 300; // 5 minutes
    uint256 public constant FINALIZE_DEADLINE_EXTENSION = 600; // 10 minutes after end

    // State
    IERC20 public immutable token; // USDC
    address public operator; // Server relayer wallet
    address public feeRecipient;
    uint16 public feeBps = 500; // 5% (500 basis points)

    enum LobbyState {
        Waiting,    // 0 - No deposits yet
        Active,     // 1 - Timer running
        Finalized   // 2 - Merkle root set, claims enabled
    }

    struct Lobby {
        uint64 startTime;
        uint64 endTime;
        uint64 finalizeDeadline;
        LobbyState state;
        bytes32 merkleRoot;
        uint96 totalDeposits;
        uint96 totalClaimed;
    }

    mapping(uint256 => Lobby) public lobbies;
    mapping(uint256 => mapping(address => bool)) public claimed;
    mapping(uint256 => mapping(address => bool)) public hasDeposited; // Track depositors for timeout refund

    // Events
    event LobbyJoined(uint256 indexed lobbyId, address indexed player);
    event LobbyActivated(uint256 indexed lobbyId, uint64 startTime, uint64 endTime);
    event LobbyFinalized(uint256 indexed lobbyId, bytes32 merkleRoot, uint96 totalPayout, uint96 feeAmount);
    event Claimed(uint256 indexed lobbyId, address indexed player, uint96 amount);
    event TimeoutRefund(uint256 indexed lobbyId, address indexed player);

    constructor(
        address _token,
        address _operator,
        address _feeRecipient
    ) {
        require(_token != address(0), "Invalid token address");
        require(_operator != address(0), "Invalid operator address");
        require(_feeRecipient != address(0), "Invalid fee recipient address");
        
        token = IERC20(_token);
        operator = _operator;
        feeRecipient = _feeRecipient;
    }

    /**
     * @dev Join a lobby by depositing 1 USDC
     * Activates lobby on first deposit
     */
    function joinLobby(uint256 lobbyId) external whenNotPaused nonReentrant {
        require(lobbies[lobbyId].state != LobbyState.Finalized, "Lobby already finalized");
        
        // Transfer 1 USDC from player
        token.safeTransferFrom(msg.sender, address(this), DEPOSIT_AMOUNT);
        
        // Track deposit for timeout refund
        hasDeposited[lobbyId][msg.sender] = true;
        
        // If first deposit, activate lobby
        if (lobbies[lobbyId].state == LobbyState.Waiting) {
            uint64 startTime = uint64(block.timestamp);
            uint64 endTime = startTime + uint64(LOBBY_DURATION);
            uint64 finalizeDeadline = endTime + uint64(FINALIZE_DEADLINE_EXTENSION);
            
            lobbies[lobbyId] = Lobby({
                startTime: startTime,
                endTime: endTime,
                finalizeDeadline: finalizeDeadline,
                state: LobbyState.Active,
                merkleRoot: bytes32(0),
                totalDeposits: uint96(DEPOSIT_AMOUNT),
                totalClaimed: 0
            });
            
            emit LobbyActivated(lobbyId, startTime, endTime);
        } else {
            // Lobby already active, increment deposits
            lobbies[lobbyId].totalDeposits += uint96(DEPOSIT_AMOUNT);
        }
        
        emit LobbyJoined(lobbyId, msg.sender);
    }

    /**
     * @dev Finalize lobby by setting Merkle root (operator only)
     */
    function finalizeLobby(
        uint256 lobbyId,
        bytes32 root,
        uint96 totalPayout,
        uint96 feeAmount
    ) external {
        require(msg.sender == operator, "Only operator");
        require(lobbies[lobbyId].state == LobbyState.Active, "Lobby not active");
        require(block.timestamp >= lobbies[lobbyId].endTime, "Lobby not ended");
        
        // Verify fee calculation: feeAmount should be feeBps of totalPayout
        // totalPayout + feeAmount should equal totalDeposits
        require(
            totalPayout + feeAmount == lobbies[lobbyId].totalDeposits,
            "Payout mismatch"
        );
        
        // Verify fee is approximately correct (allow 1 basis point tolerance)
        uint96 expectedFee = uint96((totalPayout * feeBps) / 10000);
        require(
            feeAmount >= expectedFee - 1 && feeAmount <= expectedFee + 1,
            "Fee mismatch"
        );
        
        lobbies[lobbyId].merkleRoot = root;
        lobbies[lobbyId].state = LobbyState.Finalized;
        
        // Transfer fee to fee recipient
        if (feeAmount > 0) {
            token.safeTransfer(feeRecipient, feeAmount);
        }
        
        emit LobbyFinalized(lobbyId, root, totalPayout, feeAmount);
    }

    /**
     * @dev Claim winnings using Merkle proof
     */
    function claim(
        uint256 lobbyId,
        address player,
        uint96 amount,
        bytes32[] calldata proof
    ) external nonReentrant {
        require(lobbies[lobbyId].state == LobbyState.Finalized, "Lobby not finalized");
        require(!claimed[lobbyId][player], "Already claimed");
        require(msg.sender == player, "Not your claim");
        
        // Verify Merkle proof
        bytes32 leaf = keccak256(abi.encode(player, amount));
        require(
            MerkleProof.verify(proof, lobbies[lobbyId].merkleRoot, leaf),
            "Invalid proof"
        );
        
        claimed[lobbyId][player] = true;
        lobbies[lobbyId].totalClaimed += amount;
        
        // Transfer winnings
        token.safeTransfer(player, amount);
        
        emit Claimed(lobbyId, player, amount);
    }

    /**
     * @dev Timeout refund if server fails to finalize within deadline
     */
    function timeoutRefund(uint256 lobbyId) external nonReentrant {
        Lobby storage lobby = lobbies[lobbyId];
        require(lobby.state == LobbyState.Active, "Lobby not active");
        require(block.timestamp > lobby.finalizeDeadline, "Deadline not passed");
        require(hasDeposited[lobbyId][msg.sender], "No deposit found");
        
        // Refund 1 USDC
        token.safeTransfer(msg.sender, DEPOSIT_AMOUNT);
        
        emit TimeoutRefund(lobbyId, msg.sender);
    }

    // Admin functions

    function setOperator(address _operator) external onlyOwner {
        require(_operator != address(0), "Invalid operator");
        operator = _operator;
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "Invalid fee recipient");
        feeRecipient = _feeRecipient;
    }

    function setFeeBps(uint16 _feeBps) external onlyOwner {
        require(_feeBps <= 1000, "Fee too high"); // Max 10%
        feeBps = _feeBps;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}


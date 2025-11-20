'use strict';

// Wallet connection and management module
// Uses ethers.js via window.ethereum provider

const BASE_SEPOLIA_CHAIN_ID = 84532; // Base Sepolia testnet
const { ethers } = require('ethers');

class WalletManager {
    constructor() {
        this.provider = null;
        this.signer = null;
        this.address = null;
        this.chainId = null;
        this.isConnected = false;
    }

    /**
     * Check if MetaMask or other wallet is available
     */
    isWalletAvailable() {
        return typeof window !== 'undefined' && typeof window.ethereum !== 'undefined';
    }

    /**
     * Connect wallet
     * @returns {Promise<string>} Connected address
     */
    async connectWallet() {
        if (!this.isWalletAvailable()) {
            throw new Error('No wallet detected. Please install MetaMask or another Web3 wallet.');
        }

        try {
            // Request account access
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            
            if (accounts.length === 0) {
                throw new Error('No accounts found');
            }

            this.address = accounts[0];
            this.provider = new ethers.providers.Web3Provider(window.ethereum);
            this.signer = this.provider.getSigner();
            this.isConnected = true;

            // Get current chain ID
            const network = await this.provider.getNetwork();
            this.chainId = network.chainId;

            console.log('[Wallet] Connected:', this.address);
            console.log('[Wallet] Chain ID:', this.chainId);

            // Listen for account changes
            window.ethereum.on('accountsChanged', (accounts) => {
                if (accounts.length === 0) {
                    this.disconnect();
                } else {
                    this.address = accounts[0];
                    this.provider = new ethers.providers.Web3Provider(window.ethereum);
                    this.signer = this.provider.getSigner();
                }
            });

            // Listen for chain changes
            window.ethereum.on('chainChanged', (chainId) => {
                this.chainId = parseInt(chainId, 16);
                console.log('[Wallet] Chain changed to:', this.chainId);
            });

            return this.address;
        } catch (error) {
            console.error('[Wallet] Connection error:', error);
            throw error;
        }
    }

    /**
     * Switch to Base Sepolia network
     * @returns {Promise<boolean>} True if switched successfully
     */
    async switchToBaseSepolia() {
        if (!this.isWalletAvailable()) {
            throw new Error('No wallet detected');
        }

        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: `0x${BASE_SEPOLIA_CHAIN_ID.toString(16)}` }],
            });
            return true;
        } catch (switchError) {
            // If chain doesn't exist, try to add it
            if (switchError.code === 4902) {
                try {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [{
                            chainId: `0x${BASE_SEPOLIA_CHAIN_ID.toString(16)}`,
                            chainName: 'Base Sepolia',
                            nativeCurrency: {
                                name: 'ETH',
                                symbol: 'ETH',
                                decimals: 18
                            },
                            rpcUrls: ['https://sepolia.base.org'],
                            blockExplorerUrls: ['https://sepolia-explorer.base.org']
                        }],
                    });
                    return true;
                } catch (addError) {
                    console.error('[Wallet] Error adding chain:', addError);
                    throw addError;
                }
            }
            throw switchError;
        }
    }

    /**
     * Check if connected to correct network
     * @returns {boolean} True if on Base Sepolia
     */
    isOnCorrectNetwork() {
        return this.chainId === BASE_SEPOLIA_CHAIN_ID;
    }

    /**
     * Get current address
     * @returns {string|null} Address or null
     */
    getAddress() {
        return this.address;
    }

    /**
     * Disconnect wallet
     */
    disconnect() {
        this.provider = null;
        this.signer = null;
        this.address = null;
        this.chainId = null;
        this.isConnected = false;
        console.log('[Wallet] Disconnected');
    }

    /**
     * Get signer for contract interactions
     * @returns {ethers.Signer} Signer instance
     */
    async getSigner() {
        if (!this.signer) {
            if (!this.provider) {
                this.provider = new ethers.providers.Web3Provider(window.ethereum);
            }
            this.signer = this.provider.getSigner();
        }
        return this.signer;
    }

    /**
     * Get provider
     * @returns {ethers.Provider} Provider instance
     */
    getProvider() {
        if (!this.provider) {
            this.provider = new ethers.providers.Web3Provider(window.ethereum);
        }
        return this.provider;
    }
}

// Create global instance
if (typeof window !== 'undefined') {
    window.walletManager = new WalletManager();
}

module.exports = WalletManager;


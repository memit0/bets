'use strict';

const { ethers } = require('ethers');
const config = require('../../../config');

// BetLobby ABI (minimal interface for what we need)
const BET_LOBBY_ABI = [
    "function distributeRewards(uint256 lobbyId, address[] recipients, uint96[] amounts, uint96 totalPayout, uint96 feeAmount) external",
    "event LobbyJoined(uint256 indexed lobbyId, address indexed player)",
    "event LobbyActivated(uint256 indexed lobbyId, uint64 startTime, uint64 endTime)",
    "event LobbyFinalized(uint256 indexed lobbyId, uint96 totalPayout, uint96 feeAmount)",
    "event RewardDistributed(uint256 indexed lobbyId, address indexed player, uint96 amount)"
];

class ContractClient {
    constructor() {
        if (!config.blockchain.rpcUrl || !config.blockchain.operatorPrivateKey) {
            throw new Error('Blockchain configuration missing. Set RPC_URL and OPERATOR_PRIVATE_KEY in .env');
        }

        this.provider = new ethers.providers.JsonRpcProvider(config.blockchain.rpcUrl);
        this.wallet = new ethers.Wallet(config.blockchain.operatorPrivateKey, this.provider);
        
        if (!config.blockchain.betLobbyAddress) {
            console.warn('Warning: BET_LOBBY_ADDRESS not set. Contract client will not be fully functional.');
            this.contract = null;
        } else {
            this.contract = new ethers.Contract(
                config.blockchain.betLobbyAddress,
                BET_LOBBY_ABI,
                this.wallet
            );
        }
    }

    /**
     * Distribute rewards to players directly
     * @param {number} lobbyId - The lobby ID
     * @param {string[]} recipients - Array of player addresses
     * @param {number[]} amounts - Array of amounts in USDC
     * @param {number} totalPayout - Total payout amount in USDC
     * @param {number} feeAmount - Fee amount in USDC
     * @param {number} maxRetries - Maximum retry attempts
     * @returns {Promise<Object>} Transaction receipt
     */
    async distributeRewards(lobbyId, recipients, amounts, totalPayout, feeAmount, maxRetries = 3) {
        if (!this.contract) {
            throw new Error('Contract address not configured');
        }

        let lastError;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                console.log(`[Blockchain] Distributing rewards for lobby ${lobbyId} (attempt ${attempt + 1}/${maxRetries})`);
                console.log(`[Blockchain] Recipients: ${recipients.length}, Payout: ${totalPayout}, Fee: ${feeAmount}`);

                const tx = await this.contract.distributeRewards(
                    lobbyId,
                    recipients,
                    amounts,
                    totalPayout,
                    feeAmount
                );

                console.log(`[Blockchain] Transaction sent: ${tx.hash}`);
                const receipt = await tx.wait();
                console.log(`[Blockchain] Transaction confirmed in block ${receipt.blockNumber}`);

                return {
                    success: true,
                    txHash: tx.hash,
                    blockNumber: receipt.blockNumber,
                    receipt
                };
            } catch (error) {
                lastError = error;
                console.error(`[Blockchain] Distribution attempt ${attempt + 1} failed:`, error.message);

                // Exponential backoff: wait 2^attempt seconds
                if (attempt < maxRetries - 1) {
                    const waitTime = Math.pow(2, attempt) * 1000;
                    console.log(`[Blockchain] Retrying in ${waitTime}ms...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
            }
        }

        throw new Error(`Failed to distribute rewards after ${maxRetries} attempts: ${lastError.message}`);
    }

    /**
     * Get contract instance for event listening
     * @returns {ethers.Contract} Contract instance
     */
    getContract() {
        return this.contract;
    }

    /**
     * Get provider for event listening
     * @returns {ethers.Provider} Provider instance
     */
    getProvider() {
        return this.provider;
    }

    /**
     * Get wallet address
     * @returns {string} Wallet address
     */
    getWalletAddress() {
        return this.wallet.address;
    }
}

module.exports = ContractClient;


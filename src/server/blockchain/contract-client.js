'use strict';

const { ethers } = require('ethers');
const config = require('../../../config');

// BetLobby ABI (minimal interface for what we need)
const BET_LOBBY_ABI = [
    "function finalizeLobby(uint256 lobbyId, bytes32 root, uint96 totalPayout, uint96 feeAmount) external",
    "event LobbyJoined(uint256 indexed lobbyId, address indexed player)",
    "event LobbyActivated(uint256 indexed lobbyId, uint64 startTime, uint64 endTime)",
    "event LobbyFinalized(uint256 indexed lobbyId, bytes32 merkleRoot, uint96 totalPayout, uint96 feeAmount)"
];

class ContractClient {
    constructor() {
        if (!config.blockchain.rpcUrl || !config.blockchain.operatorPrivateKey) {
            throw new Error('Blockchain configuration missing. Set RPC_URL and OPERATOR_PRIVATE_KEY in .env');
        }

        this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
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
     * Finalize a lobby by submitting Merkle root to contract
     * @param {number} lobbyId - The lobby ID
     * @param {string} merkleRoot - The Merkle root (0x-prefixed hex string)
     * @param {number} totalPayout - Total payout amount in USDC (6 decimals)
     * @param {number} feeAmount - Fee amount in USDC (6 decimals)
     * @param {number} maxRetries - Maximum retry attempts
     * @returns {Promise<Object>} Transaction receipt
     */
    async finalizeLobby(lobbyId, merkleRoot, totalPayout, feeAmount, maxRetries = 3) {
        if (!this.contract) {
            throw new Error('Contract address not configured');
        }

        let lastError;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                console.log(`[Blockchain] Finalizing lobby ${lobbyId} (attempt ${attempt + 1}/${maxRetries})`);
                console.log(`[Blockchain] Root: ${merkleRoot}, Payout: ${totalPayout}, Fee: ${feeAmount}`);

                const tx = await this.contract.finalizeLobby(
                    lobbyId,
                    merkleRoot,
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
                console.error(`[Blockchain] Finalization attempt ${attempt + 1} failed:`, error.message);

                // Exponential backoff: wait 2^attempt seconds
                if (attempt < maxRetries - 1) {
                    const waitTime = Math.pow(2, attempt) * 1000;
                    console.log(`[Blockchain] Retrying in ${waitTime}ms...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
            }
        }

        throw new Error(`Failed to finalize lobby after ${maxRetries} attempts: ${lastError.message}`);
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


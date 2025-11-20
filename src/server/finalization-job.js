'use strict';

const config = require('../../config');
const ContractClient = require('./blockchain/contract-client');
// const MerkleBuilder = require('./blockchain/merkle-builder'); // Removed
const LobbyStore = require('./repositories/lobby-store');

/**
 * Finalization Job
 * Periodically checks for lobbies ready to finalize and distributes rewards
 */
class FinalizationJob {
    constructor(lobbyManager, io = null) {
        this.lobbyManager = lobbyManager;
        this.io = io; // Socket.IO instance for broadcasting
        this.contractClient = null;
        // this.merkleBuilder = new MerkleBuilder(); // Removed
        this.lobbyStore = new LobbyStore();
        this.isRunning = false;
        this.intervalId = null;

        // Initialize contract client if configured
        try {
            this.contractClient = new ContractClient();
        } catch (error) {
            console.warn('[FinalizationJob] Contract client not available:', error.message);
        }
    }

    /**
     * Start the finalization job (runs every 30 seconds)
     */
    start() {
        if (this.isRunning) {
            console.warn('[FinalizationJob] Already running');
            return;
        }

        this.isRunning = true;
        console.log('[FinalizationJob] Starting finalization job (checking every 30s)');

        // Run immediately, then every 30 seconds
        this.checkAndFinalize();
        this.intervalId = setInterval(() => {
            this.checkAndFinalize();
        }, 30000); // 30 seconds
    }

    /**
     * Stop the finalization job
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        console.log('[FinalizationJob] Stopped');
    }

    /**
     * Check for lobbies ready to finalize and process them
     */
    async checkAndFinalize() {
        const readyLobbies = this.lobbyManager.getLobbiesReadyForFinalization();

        if (readyLobbies.length === 0) {
            return;
        }

        console.log(`[FinalizationJob] Found ${readyLobbies.length} lobby/lobbies ready for finalization`);

        for (const lobbyId of readyLobbies) {
            try {
                await this.finalizeLobby(lobbyId);
            } catch (error) {
                console.error(`[FinalizationJob] Error finalizing lobby ${lobbyId}:`, error);
            }
        }
    }

    /**
     * Finalize a single lobby
     * @param {number} lobbyId - Lobby ID
     */
    async finalizeLobby(lobbyId) {
        const lobby = this.lobbyManager.getLobby(lobbyId);

        if (lobby.state === 'finalized') {
            console.log(`[FinalizationJob] Lobby ${lobbyId} already finalized`);
            return;
        }

        console.log(`[FinalizationJob] Finalizing lobby ${lobbyId}`);

        // Force despawn all players in this lobby (ends gameplay)
        this.lobbyManager.despawnLobbyPlayers(lobbyId, this.io);

        // Mark as finalizable
        this.lobbyManager.markFinalizable(lobbyId);

        // Get final balances
        const finalBalances = this.lobbyManager.getFinalBalances(lobbyId);
        console.log(`[FinalizationJob] Final balances for lobby ${lobbyId}:`, finalBalances);

        // Calculate total deposits (all players who joined)
        const totalDeposits = lobby.balances.size * config.blockchain.depositAmount;

        // Apply 5% fee to positive balances
        const feeBps = config.blockchain.feeBps;
        let totalPayout = 0;
        let totalFee = 0;

        const balancesWithFee = finalBalances.map(balance => {
            if (balance.amount > 0) {
                const fee = Math.floor((balance.amount * feeBps) / 10000);
                const payout = balance.amount - fee;
                totalPayout += payout;
                totalFee += fee;
                return {
                    address: balance.address,
                    amount: payout // Amount after fee
                };
            } else {
                return balance;
            }
        });

        // Calculate dead money (unclaimed funds from PvE deaths, disconnects, etc.)
        // This ensures: totalPayout + totalFee + deadMoney == totalDeposits
        const activePlayerPayouts = balancesWithFee.reduce((sum, b) => sum + b.amount, 0);
        const deadMoney = totalDeposits - activePlayerPayouts - totalFee;
        
        // Add dead money to fee (house takes it)
        if (deadMoney > 0) {
            totalFee += deadMoney;
            console.log(`[FinalizationJob] Dead money added to fee: ${deadMoney} (total deposits: ${totalDeposits}, active payouts: ${activePlayerPayouts})`);
        }

        // Prepare distribution lists
        const recipients = [];
        const amounts = [];
        
        balancesWithFee.forEach(balance => {
            recipients.push(balance.address);
            amounts.push(balance.amount);
        });

        console.log(`[FinalizationJob] Distributing rewards for lobby ${lobbyId}`);

        // Save to disk
        const lobbySnapshot = {
            lobbyId,
            finalizedAt: Date.now(),
            finalBalances: balancesWithFee,
            recipients,
            amounts,
            totalPayout,
            totalFee
        };

        this.lobbyStore.saveLobby(lobbyId, lobbySnapshot);

        // Submit to contract if client is available
        if (this.contractClient) {
            try {
                const result = await this.contractClient.distributeRewards(
                    lobbyId,
                    recipients,
                    amounts,
                    totalPayout,
                    totalFee
                );

                console.log(`[FinalizationJob] Successfully distributed rewards for lobby ${lobbyId} on-chain: ${result.txHash}`);

                // Mark as finalized
                this.lobbyManager.markFinalized(lobbyId);

                // Update snapshot with tx hash
                lobbySnapshot.txHash = result.txHash;
                lobbySnapshot.blockNumber = result.blockNumber;
                this.lobbyStore.saveLobby(lobbyId, lobbySnapshot);

                // Broadcast to all players in lobby
                if (this.io && lobby.players) {
                    for (const [socketId, playerState] of lobby.players.entries()) {
                        this.io.to(socketId).emit('lobbyFinalized', {
                            lobbyId,
                            balance: playerState.balance,
                            txHash: result.txHash
                        });
                    }
                }

            } catch (error) {
                console.error(`[FinalizationJob] Failed to distribute rewards for lobby ${lobbyId} on-chain:`, error);
                // Don't mark as finalized if contract call failed
                // Job will retry on next check
                throw error;
            }
        } else {
            // No contract client, just mark as finalized locally
            console.warn(`[FinalizationJob] No contract client, marking lobby ${lobbyId} as finalized locally only`);
            this.lobbyManager.markFinalized(lobbyId);
        }
    }
}

module.exports = FinalizationJob;


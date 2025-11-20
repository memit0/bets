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

        // Calculate fee and payouts
        // The contract expects: feeAmount ≈ (totalPayout * feeBps) / 10000
        // To ensure totalPayout + feeAmount = totalDeposits, we use:
        // totalPayout = totalDeposits * 10000 / (10000 + feeBps)
        // feeAmount = totalDeposits - totalPayout
        const feeBps = config.blockchain.feeBps;
        
        // Calculate total payout (all active players' balances)
        const activeTotalBalance = finalBalances.reduce((sum, b) => sum + b.amount, 0);
        
        // Calculate the scaling factor to apply fee correctly
        // If activeTotalBalance == totalDeposits, then apply fee normally
        // If activeTotalBalance < totalDeposits (dead money exists), handle it
        const totalPayout = Math.floor((activeTotalBalance * 10000) / (10000 + feeBps));
        const totalFee = totalDeposits - totalPayout;
        
        // Now distribute the totalPayout proportionally among active players
        const balancesWithFee = finalBalances.map(balance => {
            if (balance.amount > 0 && activeTotalBalance > 0) {
                // Calculate this player's share of the total payout
                const playerShare = Math.floor((balance.amount * totalPayout) / activeTotalBalance);
                return {
                    address: balance.address,
                    amount: playerShare
                };
            } else {
                return {
                    address: balance.address,
                    amount: 0
                };
            }
        });

        console.log(`[FinalizationJob] Fee calculation: activeTotalBalance=${activeTotalBalance}, totalPayout=${totalPayout}, totalFee=${totalFee}`);

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


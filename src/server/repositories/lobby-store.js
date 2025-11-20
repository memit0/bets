'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Lobby Store
 * Persists lobby snapshots and Merkle data to disk
 */
class LobbyStore {
    constructor() {
        // Store lobbies in data/lobbies directory
        this.dataDir = path.join(__dirname, 'lobbies');
        
        // Ensure directory exists
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }

    /**
     * Save lobby snapshot with Merkle data
     * @param {number} lobbyId - Lobby ID
     * @param {Object} data - Lobby data including balances, Merkle tree, etc.
     */
    saveLobby(lobbyId, data) {
        const filePath = path.join(this.dataDir, `lobby-${lobbyId}.json`);
        const jsonData = JSON.stringify(data, null, 2);
        
        fs.writeFileSync(filePath, jsonData, 'utf8');
        console.log(`[LobbyStore] Saved lobby ${lobbyId} to ${filePath}`);
    }

    /**
     * Load lobby snapshot
     * @param {number} lobbyId - Lobby ID
     * @returns {Object|null} Lobby data or null if not found
     */
    loadLobby(lobbyId) {
        const filePath = path.join(this.dataDir, `lobby-${lobbyId}.json`);
        
        if (!fs.existsSync(filePath)) {
            return null;
        }

        try {
            const jsonData = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(jsonData);
        } catch (error) {
            console.error(`[LobbyStore] Error loading lobby ${lobbyId}:`, error);
            return null;
        }
    }

    /**
     * Get claim data for a specific address
     * @param {number} lobbyId - Lobby ID
     * @param {string} address - Ethereum address
     * @returns {Object|null} {amount, proof, leaf} or null if not found
     */
    getClaimData(lobbyId, address) {
        const lobby = this.loadLobby(lobbyId);
        if (!lobby) {
            return null;
        }

        const normalizedAddress = address.toLowerCase();
        
        // Find the balance entry for this address
        const balanceIndex = lobby.finalBalances.findIndex(
            b => b.address.toLowerCase() === normalizedAddress
        );

        if (balanceIndex === -1) {
            return null;
        }

        const balance = lobby.finalBalances[balanceIndex];
        
        return {
            amount: balance.amount,
            proof: lobby.proofs[balanceIndex],
            leaf: lobby.leaves[balanceIndex],
            address: balance.address
        };
    }

    /**
     * Check if lobby exists
     * @param {number} lobbyId - Lobby ID
     * @returns {boolean} True if lobby file exists
     */
    lobbyExists(lobbyId) {
        const filePath = path.join(this.dataDir, `lobby-${lobbyId}.json`);
        return fs.existsSync(filePath);
    }

    /**
     * List all saved lobbies
     * @returns {Array} Array of lobby IDs
     */
    listLobbies() {
        if (!fs.existsSync(this.dataDir)) {
            return [];
        }

        const files = fs.readdirSync(this.dataDir);
        return files
            .filter(file => file.startsWith('lobby-') && file.endsWith('.json'))
            .map(file => {
                const match = file.match(/lobby-(\d+)\.json/);
                return match ? parseInt(match[1], 10) : null;
            })
            .filter(id => id !== null)
            .sort((a, b) => a - b);
    }
}

module.exports = LobbyStore;


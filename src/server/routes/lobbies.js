'use strict';

const express = require('express');
const router = express.Router();
const LobbyStore = require('../repositories/lobby-store');

const lobbyStore = new LobbyStore();

/**
 * GET /lobbies/:id/claims/:address
 * Get Merkle proof data for a specific address in a lobby
 */
router.get('/:id/claims/:address', (req, res) => {
    const lobbyId = parseInt(req.params.id, 10);
    const address = req.params.address;

    if (isNaN(lobbyId)) {
        return res.status(400).json({ error: 'Invalid lobby ID' });
    }

    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return res.status(400).json({ error: 'Invalid address format' });
    }

    const claimData = lobbyStore.getClaimData(lobbyId, address);

    if (!claimData) {
        return res.status(404).json({ 
            error: 'Claim data not found',
            message: `No claim data found for address ${address} in lobby ${lobbyId}`
        });
    }

    res.json({
        lobbyId,
        address: claimData.address,
        amount: claimData.amount,
        proof: claimData.proof,
        leaf: claimData.leaf
    });
});

/**
 * GET /lobbies/:id
 * Get lobby information
 */
router.get('/:id', (req, res) => {
    const lobbyId = parseInt(req.params.id, 10);

    if (isNaN(lobbyId)) {
        return res.status(400).json({ error: 'Invalid lobby ID' });
    }

    const lobby = lobbyStore.loadLobby(lobbyId);

    if (!lobby) {
        return res.status(404).json({ 
            error: 'Lobby not found',
            message: `Lobby ${lobbyId} not found`
        });
    }

    // Return lobby info (without sensitive data)
    res.json({
        lobbyId: lobby.lobbyId,
        finalizedAt: lobby.finalizedAt,
        merkleRoot: lobby.merkleRoot,
        totalPayout: lobby.totalPayout,
        totalFee: lobby.totalFee,
        txHash: lobby.txHash,
        blockNumber: lobby.blockNumber,
        playerCount: lobby.finalBalances ? lobby.finalBalances.length : 0
    });
});

module.exports = router;


'use strict';

const { MerkleTree } = require('merkletreejs');
const { ethers } = require('ethers');

/**
 * Merkle Tree Builder
 * Creates deterministic Merkle trees from final balances for claim verification
 */
class MerkleBuilder {
    /**
     * Build Merkle tree from final balances
     * @param {Array} balances - Array of {address, amount} objects, sorted by address
     * @returns {Object} {tree, root, leaves, proofs}
     */
    buildTree(balances) {
        // Create leaves: keccak256(abi.encode(address, amount))
        const leaves = balances.map(balance => {
            // Encode and hash leaf
            const leaf = this.encodeLeaf(balance.address, balance.amount);
            return Buffer.from(ethers.getBytes(leaf));
        });

        // Build tree
        const tree = new MerkleTree(leaves, (data) => {
            return Buffer.from(ethers.keccak256(data).slice(2), 'hex');
        }, { sortPairs: true });

        // Get root
        const root = '0x' + tree.getRoot().toString('hex');

        // Generate proofs for each leaf
        const proofs = leaves.map((leaf, index) => {
            const proof = tree.getProof(leaf);
            return proof.map(p => '0x' + p.data.toString('hex'));
        });

        // Get leaf values (for verification)
        const leafValues = leaves.map(leaf => '0x' + leaf.toString('hex'));

        return {
            tree,
            root,
            leaves: leafValues,
            proofs,
            balances // Keep original balances for reference
        };
    }

    /**
     * Encode leaf as keccak256(abi.encode(address, amount))
     * @param {string} address - Ethereum address (0x-prefixed)
     * @param {number} amount - Amount in USDC (6 decimals)
     * @returns {string} Hex-encoded leaf
     */
    encodeLeaf(address, amount) {
        // Use ethers ABI encoding: abi.encode(address, uint96)
        const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
            ['address', 'uint96'],
            [address, amount]
        );
        
        // Hash with keccak256
        return ethers.keccak256(encoded);
    }

    /**
     * Verify a proof
     * @param {string} address - Ethereum address
     * @param {number} amount - Amount
     * @param {Array} proof - Merkle proof
     * @param {string} root - Merkle root
     * @returns {boolean} True if valid
     */
    verifyProof(address, amount, proof, root) {
        const leaf = this.encodeLeaf(address, amount);
        const leafBuffer = Buffer.from(ethers.getBytes(leaf));
        const proofBuffers = proof.map(p => Buffer.from(ethers.getBytes(p)));
        const rootBuffer = Buffer.from(ethers.getBytes(root));

        return MerkleTree.verify(proofBuffers, leafBuffer, rootBuffer, (data) => {
            return Buffer.from(ethers.keccak256(data).slice(2), 'hex');
        }, { sortPairs: true });
    }
}

module.exports = MerkleBuilder;


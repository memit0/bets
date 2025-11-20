// Load environment variables from .env file
require('dotenv').config();

module.exports = {
    host: "0.0.0.0",
    port: 3000,
    logpath: "logger.php",
    foodMass: 1,
    fireFood: 20,
    limitSplit: 16,
    defaultPlayerMass: 10,
	virus: {
        fill: "#33ff33",
        stroke: "#19D119",
        strokeWidth: 20,
        defaultMass: {
            from: 100,
            to: 150
        },
        splitMass: 180,
        uniformDisposition: false,
	},
    gameWidth: 5000,
    gameHeight: 5000,
    adminPass: "DEFAULT",
    gameMass: 20000,
    maxFood: 1000,
    maxVirus: 50,
    slowBase: 4.5,
    logChat: 0,
    networkUpdateFactor: 40,
    maxHeartbeatInterval: 5000,
    foodUniformDisposition: true,
    newPlayerInitialPosition: "farthest",
    massLossRate: 1,
    minMassLoss: 50,
    sqlinfo: {
      fileName: "db.sqlite3",
    },
    blockchain: {
        // Base Sepolia testnet defaults
        rpcUrl: process.env.RPC_URL || "https://sepolia.base.org",
        chainId: process.env.CHAIN_ID || 84532,
        usdcAddress: process.env.USDC_ADDRESS || "", // Must be set in .env
        betLobbyAddress: process.env.BET_LOBBY_ADDRESS || "", // Must be set after deployment
        operatorPrivateKey: process.env.OPERATOR_PRIVATE_KEY || "", // Must be set in .env
        feeRecipient: process.env.FEE_RECIPIENT || "", // Must be set in .env
        feeBps: 500, // 5%
        lobbyDuration: 300, // 5 minutes in seconds
        finalizeDeadline: 600, // 10 minutes after end
        cashOutGraceSeconds: 45, // Grace period before cash-out allowed
        depositAmount: 1000000 // 1 USDC (6 decimals)
    }
};

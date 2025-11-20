const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  
  console.log("Deploying with account:", deployer.address);
  
  // Deploy BetLobby
  const BetLobby = await hre.ethers.getContractFactory("BetLobby");
  const usdcAddress = process.env.USDC_ADDRESS; // Your USDC address
  const operatorAddress = process.env.OPERATOR_ADDRESS || deployer.address;
  const feeRecipient = process.env.FEE_RECIPIENT || deployer.address;
  
  if (!usdcAddress) {
    throw new Error("USDC_ADDRESS environment variable is required");
  }
  
  console.log("Deployment parameters:");
  console.log("  USDC Address:", usdcAddress);
  console.log("  Operator Address:", operatorAddress);
  console.log("  Fee Recipient:", feeRecipient);
  
  const betLobby = await BetLobby.deploy(
    usdcAddress,
    operatorAddress,
    feeRecipient
  );
  
  await betLobby.waitForDeployment();
  const address = await betLobby.getAddress();
  
  console.log("\n✅ BetLobby deployed to:", address);
  console.log("\nSave this address to your .env file as BET_LOBBY_ADDRESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


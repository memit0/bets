// Simple deployment script for BetLobby using ethers v5
require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');

async function main() {
  // Read compiled contract
  const artifact = require('../artifacts/contracts/BetLobby.sol/BetLobby.json');
  
  // Connect to Base Sepolia
  const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.OPERATOR_PRIVATE_KEY, provider);
  
  console.log("Deploying BetLobby with account:", wallet.address);
  
  const balance = await wallet.getBalance();
  console.log("Account balance:", ethers.utils.formatEther(balance), "ETH");
  
  if (balance.lt(ethers.utils.parseEther("0.005"))) {
    console.warn("\n⚠️  WARNING: Low balance. You might not have enough ETH for deployment.");
  }
  
  const usdcAddress = process.env.USDC_ADDRESS;
  const operatorAddress = wallet.address; // Use deployer as operator
  const feeRecipient = process.env.FEE_RECIPIENT || wallet.address;
  
  if (!usdcAddress) {
    throw new Error("USDC_ADDRESS not set in .env");
  }
  
  console.log("\nDeployment parameters:");
  console.log("  USDC Address:", usdcAddress);
  console.log("  Operator Address:", operatorAddress);
  console.log("  Fee Recipient:", feeRecipient);
  
  // Create contract factory
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  
  console.log("\nDeploying BetLobby contract...");
  const contract = await factory.deploy(
    usdcAddress,
    operatorAddress,
    feeRecipient,
    {
      gasLimit: 3000000 // Manual gas limit
    }
  );
  
  console.log("Transaction hash:", contract.deployTransaction.hash);
  console.log("Waiting for confirmation...");
  
  await contract.deployed();
  
  console.log("\n✅ BetLobby deployed to:", contract.address);
  console.log("\nUpdate your .env file:");
  console.log("BET_LOBBY_ADDRESS=" + contract.address);
  console.log("\nView on explorer:");
  console.log("https://sepolia-explorer.base.org/address/" + contract.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


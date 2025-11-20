// Simple deployment script using ethers v5 directly
require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');

async function main() {
  // Read compiled contract
  const artifact = require('../artifacts/contracts/MockUSDC.sol/MockUSDC.json');
  
  // Connect to Base Sepolia
  const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.OPERATOR_PRIVATE_KEY, provider);
  
  console.log("Deploying MockUSDC with account:", wallet.address);
  
  const balance = await wallet.getBalance();
  console.log("Account balance:", ethers.utils.formatEther(balance), "ETH");
  
  if (balance.eq(0)) {
    console.error("\nERROR: Account has no ETH for gas!");
    console.error("Please send some Base Sepolia ETH to:", wallet.address);
    console.error("Get testnet ETH from: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet");
    process.exit(1);
  }
  
  // Create contract factory
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  
  console.log("\nDeploying MockUSDC contract...");
  const contract = await factory.deploy({
    gasLimit: 2000000 // Manual gas limit
  });
  
  console.log("Transaction hash:", contract.deployTransaction.hash);
  console.log("Waiting for confirmation...");
  
  await contract.deployed();
  
  console.log("\n✅ MockUSDC deployed to:", contract.address);
  console.log("\nUpdate your .env file:");
  console.log("USDC_ADDRESS=" + contract.address);
  
  // Check balance
  const deployerBalance = await contract.balanceOf(wallet.address);
  console.log("\nDeployer USDC balance:", ethers.utils.formatUnits(deployerBalance, 6), "USDC");
  console.log("\nView on explorer:");
  console.log("https://sepolia-explorer.base.org/address/" + contract.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


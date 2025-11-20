const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying MockUSDC with account:", deployer.address);
  
  const balance = await deployer.getBalance();
  console.log("Account balance:", hre.ethers.utils.formatEther(balance), "ETH");
  
  const MockUSDC = await hre.ethers.getContractFactory("MockUSDC");
  console.log("Deploying MockUSDC...");
  const mockUSDC = await MockUSDC.deploy();
  
  await mockUSDC.deployed();
  
  console.log("MockUSDC deployed to:", mockUSDC.address);
  console.log("\nUpdate your .env file:");
  console.log("USDC_ADDRESS=" + mockUSDC.address);
  
  // Mint some USDC to deployer
  const deployerBalance = await mockUSDC.balanceOf(deployer.address);
  console.log("\nDeployer USDC balance:", hre.ethers.utils.formatUnits(deployerBalance, 6), "USDC");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


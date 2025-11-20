const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying MockUSDC with account:", deployer.address);
  
  const MockUSDC = await hre.ethers.getContractFactory("MockUSDC");
  const mockUSDC = await MockUSDC.deploy();
  
  await mockUSDC.waitForDeployment();
  const address = await mockUSDC.getAddress();
  
  console.log("MockUSDC deployed to:", address);
  console.log("\nSave this address to your .env file as USDC_ADDRESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


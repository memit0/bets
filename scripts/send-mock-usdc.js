// Script to send MockUSDC tokens to users
// Usage: node scripts/send-mock-usdc.js <recipient_address> <amount>
// Example: node scripts/send-mock-usdc.js 0x1234...5678 10
// This will send 10 USDC to the recipient

require('dotenv').config();
const { ethers } = require('ethers');

async function main() {
  // Get recipient address and amount from command line
  const recipientAddress = process.argv[2];
  const amount = process.argv[3] || '10'; // Default to 10 USDC

  if (!recipientAddress) {
    console.error('Error: Recipient address required');
    console.error('Usage: node scripts/send-mock-usdc.js <recipient_address> [amount]');
    console.error('Example: node scripts/send-mock-usdc.js 0x1234...5678 10');
    process.exit(1);
  }

  // Validate address
  if (!ethers.utils.isAddress(recipientAddress)) {
    console.error('Error: Invalid recipient address');
    process.exit(1);
  }

  // Connect to Base Sepolia
  const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || 'https://sepolia.base.org');
  
  // Use the deployer's private key (the one that deployed MockUSDC)
  // You can set DEPLOYER_PRIVATE_KEY in .env, or use OPERATOR_PRIVATE_KEY
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY || process.env.OPERATOR_PRIVATE_KEY;
  
  if (!deployerKey) {
    console.error('Error: DEPLOYER_PRIVATE_KEY or OPERATOR_PRIVATE_KEY must be set in .env');
    console.error('This should be the private key of the wallet that deployed MockUSDC');
    process.exit(1);
  }

  const wallet = new ethers.Wallet(deployerKey, provider);
  const usdcAddress = process.env.USDC_ADDRESS || '0x301C23eC2162EBc8D8Ff8d47ED9883DDF31f6C72';

  console.log('Sending MockUSDC tokens...');
  console.log('From:', wallet.address);
  console.log('To:', recipientAddress);
  console.log('Amount:', amount, 'USDC');
  console.log('USDC Contract:', usdcAddress);

  // Check deployer's ETH balance for gas
  const ethBalance = await wallet.getBalance();
  if (ethBalance.eq(0)) {
    console.error('Error: Deployer wallet has no ETH for gas fees');
    console.error('Please send Base Sepolia ETH to:', wallet.address);
    process.exit(1);
  }
  console.log('Deployer ETH balance:', ethers.utils.formatEther(ethBalance), 'ETH');

  // Create USDC contract instance
  const usdcABI = [
    'function transfer(address to, uint256 amount) external returns (bool)',
    'function balanceOf(address account) external view returns (uint256)',
    'function decimals() external pure returns (uint8)'
  ];
  
  const usdcContract = new ethers.Contract(usdcAddress, usdcABI, wallet);

  // Check deployer's USDC balance
  const deployerBalance = await usdcContract.balanceOf(wallet.address);
  const decimals = await usdcContract.decimals();
  const deployerBalanceFormatted = ethers.utils.formatUnits(deployerBalance, decimals);
  console.log('Deployer USDC balance:', deployerBalanceFormatted, 'USDC');

  // Convert amount to wei (USDC has 6 decimals)
  const amountWei = ethers.utils.parseUnits(amount, decimals);
  
  if (deployerBalance.lt(amountWei)) {
    console.error('Error: Insufficient USDC balance');
    console.error('Required:', amount, 'USDC');
    console.error('Available:', deployerBalanceFormatted, 'USDC');
    process.exit(1);
  }

  // Send tokens
  console.log('\nSending transaction...');
  const tx = await usdcContract.transfer(recipientAddress, amountWei);
  console.log('Transaction hash:', tx.hash);
  console.log('Waiting for confirmation...');
  
  const receipt = await tx.wait();
  console.log('\n✅ Transaction confirmed!');
  console.log('Block:', receipt.blockNumber);
  console.log('Gas used:', receipt.gasUsed.toString());
  
  // Verify transfer
  const recipientBalance = await usdcContract.balanceOf(recipientAddress);
  const recipientBalanceFormatted = ethers.utils.formatUnits(recipientBalance, decimals);
  console.log('\nRecipient USDC balance:', recipientBalanceFormatted, 'USDC');
  
  console.log('\nView transaction on explorer:');
  console.log(`https://sepolia-explorer.base.org/tx/${tx.hash}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


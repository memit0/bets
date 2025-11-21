# Quick Start Guide

## Essential Steps (Minimum to Get Running)

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Smart Contract

**Option A: Use Hardhat**
```bash
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox @openzeppelin/contracts
npx hardhat init
```

### 3. Get Testnet Tokens

1. **Base Sepolia ETH**: Use [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-goerli-faucet)
2. **Base Sepolia USDC**: Bridge from Ethereum Sepolia or deploy mock USDC

### 4. Deploy Contract

**Using Hardhat:**
```bash
# Create scripts/deploy.js (see SETUP_GUIDE.md)
RPC_URL=https://sepolia.base.org \
PRIVATE_KEY=your_key \
USDC_ADDRESS=0x... \
OPERATOR_ADDRESS=0x... \
FEE_RECIPIENT=0x... \
npx hardhat run scripts/deploy.js --network baseSepolia
```

**Save the deployed contract address!**

### 5. Create .env File

Copy `.env.example` to `.env` and fill in:

```env
RPC_URL=https://sepolia.base.org
CHAIN_ID=84532
USDC_ADDRESS=0x...  # Your USDC address
BET_LOBBY_ADDRESS=0x...  # From deployment step
OPERATOR_PRIVATE_KEY=0x...  # Private key of operator wallet
FEE_RECIPIENT=0x...  # Address to receive fees
```

### 6. Fund Operator Wallet

Send Base Sepolia ETH to the operator wallet address (for gas to finalize lobbies).

### 7. Set Contract Operator

Call `setOperator(OPERATOR_ADDRESS)` on the deployed contract (use block explorer or Hardhat console).

### 8. Start Server

```bash
npm start
```

### 9. Open Game

Navigate to `http://localhost:3000` in your browser.

### 10. Test Flow

1. Connect wallet (MetaMask)
2. Approve USDC
3. Join lobby (deposit 1 USDC)
4. Play game
5. Wait for lobby to end (5 minutes)
6. Claim winnings

## Troubleshooting

- **"Contract address not configured"** → Set `BET_LOBBY_ADDRESS` in `.env`
- **"Operator private key missing"** → Set `OPERATOR_PRIVATE_KEY` in `.env`
- **"Insufficient funds"** → Fund operator wallet with Base Sepolia ETH
- **Server won't start** → Check Node.js version (need 18+), check port 3000 is free

## Full Details

See `SETUP_GUIDE.md` for complete instructions, testing procedures, and edge cases.


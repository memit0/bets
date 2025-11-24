# Setup and Testing Guide

This guide walks you through all manual steps needed to deploy and test the trustless wagering system.

## Prerequisites

- Node.js 18+ installed
- npm or yarn
- MetaMask or another Web3 wallet
- Access to Base Sepolia testnet


## Step 1: Install Dependencies

```bash
npm install
```

This installs all required packages including:
- ethers.js (blockchain interactions)
- merkletreejs (Merkle proof generation)
- socket.io (real-time game communication)
- express (web server)

## Step 2: Set Up Smart Contract Development Environment

1. Install Hardhat:
```bash
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
```

2. Initialize Hardhat:
```bash
npx hardhat init
```
Choose "Create a JavaScript project"

3. Install OpenZeppelin contracts:
```bash
npm install @openzeppelin/contracts
```

4. Create `hardhat.config.js`:
```javascript
require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    baseSepolia: {
      url: process.env.RPC_URL || "https://sepolia.base.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
    }
  }
};
```

## Step 3: Get Testnet Tokens

### Get Base Sepolia ETH

1. Go to [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-goerli-faucet) or [Alchemy Base Sepolia Faucet](https://www.alchemy.com/faucets/base-sepolia)
2. Connect your wallet
3. Request testnet ETH (you'll need ~0.1 ETH for gas)

### Get Base Sepolia USDC

**Option 1: Bridge from Ethereum Sepolia**
1. Go to [Base Bridge](https://bridge.base.org/)
2. Bridge USDC from Ethereum Sepolia to Base Sepolia

**Option 2: Use a testnet USDC faucet** (if available)
- Some testnets provide USDC directly

**Option 3: Deploy a mock USDC contract** (for testing only)

The MockUSDC contract and deployment script are already included in this repository:
- `contracts/MockUSDC.sol` - Mock USDC contract
- `scripts/deploy-mock-usdc.js` - Deployment script

1. Deploy MockUSDC:
```bash
npx hardhat run scripts/deploy-mock-usdc.js --network baseSepolia
```

2. Transfer some USDC to your test wallets for testing.

## Step 4: Deploy Smart Contract

The BetLobby deployment script is already included in this repository:
- `scripts/deploy.js` - Deployment script for BetLobby contract

1. Deploy BetLobby:
```bash
RPC_URL=https://sepolia.base.org \
PRIVATE_KEY=your_private_key \
USDC_ADDRESS=0x... \
OPERATOR_ADDRESS=0x... \
FEE_RECIPIENT=0x... \
npx hardhat run scripts/deploy.js --network baseSepolia
```

2. Verify contract (optional but recommended):
```bash
npx hardhat verify --network baseSepolia <CONTRACT_ADDRESS> <USDC_ADDRESS> <OPERATOR_ADDRESS> <FEE_RECIPIENT>
```

## Step 5: Configure Environment Variables

1. Create `.env` file in project root:
```bash
touch .env
```

2. Add the following variables:
```env
# Blockchain Configuration
RPC_URL=https://sepolia.base.org
CHAIN_ID=84532

# Contract Addresses
USDC_ADDRESS=0x...  # Your USDC token address on Base Sepolia
BET_LOBBY_ADDRESS=0x...  # Address from deployment step

# Operator Wallet (server relayer)
OPERATOR_PRIVATE_KEY=0x...  # Private key of wallet that will finalize lobbies
FEE_RECIPIENT=0x...  # Address to receive 5% fees

# Server Configuration (optional, defaults in config.js)
PORT=3000
HOST=0.0.0.0
```

**Important Security Notes:**
- Never commit `.env` to git (add to `.gitignore`)
- The `OPERATOR_PRIVATE_KEY` should be a dedicated wallet with minimal funds
- Keep private keys secure

## Step 6: Fund Operator Wallet

1. Send Base Sepolia ETH to the operator wallet address
   - You'll need ETH for gas to finalize lobbies
   - Recommend: 0.1-0.5 ETH for testing

2. Verify balance:
```bash
# Using ethers.js console or block explorer
# Check: https://sepolia-explorer.base.org/address/YOUR_OPERATOR_ADDRESS
```

## Step 7: Set Contract Operator

After deployment, set the operator address:

```javascript
// Using Hardhat console or ethers.js
const betLobby = await ethers.getContractAt("BetLobby", BET_LOBBY_ADDRESS);
await betLobby.setOperator(OPERATOR_ADDRESS);
```

Or use a block explorer to call `setOperator(OPERATOR_ADDRESS)`.

## Step 8: Start the Server

1. Make sure `.env` is configured correctly

2. Start the server:
```bash
npm start
```

Or for development with auto-reload:
```bash
npm run watch
```

3. Verify server is running:
   - Check console for: `[DEBUG] Listening on 0.0.0.0:3000`
   - Check for: `[FinalizationJob] Starting finalization job`
   - Check for: `[EventListener] Starting to listen for LobbyJoined events`

## Step 9: Access the Game

1. Open browser to: `http://localhost:3000`

2. Open browser console (F12) to see logs

3. You should see:
   - Start menu
   - Wallet panel (if MetaMask is installed)

## Step 10: Test the Full Flow

### Test 1: Wallet Connection

1. Click "Connect Wallet"
2. Approve MetaMask connection
3. Switch to Base Sepolia if prompted
4. Verify wallet address appears

### Test 2: USDC Approval

1. Click "Approve 1 USDC"
2. Confirm transaction in MetaMask
3. Wait for confirmation
4. "Join Lobby" button should appear

### Test 3: Join Lobby

1. Click "Join Lobby (1 USDC)"
2. Confirm transaction in MetaMask
3. Wait for transaction confirmation
4. Server should verify deposit and activate lobby
5. Game HUD should appear with timer and balance

### Test 4: Gameplay

1. Enter player name and click "Play"
2. Move around, eat food
3. Try to eat other players
4. Watch balance update on kills
5. Test cash-out button (after 45 seconds)

### Test 5: Lobby Finalization

1. Wait for 5-minute timer to expire
2. Check server logs for finalization
3. Verify Merkle root submitted to contract
4. Check contract on block explorer for `LobbyFinalized` event

### Test 6: Claim Winnings

1. After lobby finalizes, results modal should appear
2. Click "Claim Winnings"
3. Confirm transaction in MetaMask
4. Verify USDC received in wallet

## Step 11: Monitor and Debug

### Check Server Logs

Look for:
- `[Blockchain] Player ... confirmed deposit`
- `[Lobby] Activated lobby ...`
- `[FinalizationJob] Finalizing lobby ...`
- `[Blockchain] Successfully finalized lobby ...`

### Check Contract Events

Use block explorer or ethers.js:
- `LobbyJoined` events
- `LobbyActivated` events
- `LobbyFinalized` events
- `Claimed` events

### Common Issues

**Issue: "Contract address not configured"**
- Solution: Set `BET_LOBBY_ADDRESS` in `.env`

**Issue: "Operator private key missing"**
- Solution: Set `OPERATOR_PRIVATE_KEY` in `.env`

**Issue: "Insufficient funds for gas"**
- Solution: Fund operator wallet with Base Sepolia ETH

**Issue: "Deposit not verified"**
- Solution: Check event listener is running, verify RPC URL is correct

**Issue: "USDC allowance insufficient"**
- Solution: Player needs to approve USDC first

## Step 12: Testing with Multiple Players

1. Open multiple browser windows/incognito tabs
2. Connect different wallets in each
3. Each player deposits 1 USDC
4. Play and test kill mechanics
5. Verify balances transfer correctly
6. Test finalization with multiple players

## Step 13: Test Edge Cases

### Test Timeout Refund

1. Disable finalization job (comment out in server.js)
2. Wait 15 minutes after lobby ends
3. Call `timeoutRefund(lobbyId)` on contract
4. Verify 1 USDC refunded

### Test Network Disconnect

1. Player disconnects (close network connection)
2. Verify grace period (30 seconds)
3. Reconnect within grace period
4. Verify balance preserved

### Test Intentional Exit

1. Player closes tab
2. Verify balance immediately set to 0
3. Verify status set to 'dead'

## Additional Configuration

### Adjust Lobby Duration (for testing)

In `config.js`:
```javascript
lobbyDuration: 60, // 1 minute for faster testing
```

### Adjust Grace Periods

In `config.js`:
```javascript
cashOutGraceSeconds: 10, // Shorter grace period for testing
```

And in `server.js`:
```javascript
const RECONNECT_GRACE_PERIOD = 10000; // 10 seconds for testing
```

## Production Considerations

Before deploying to production:

1. **Security Audit**: Get smart contract audited
2. **Access Control**: Review operator permissions
3. **Rate Limiting**: Add rate limits to API endpoints
4. **Monitoring**: Set up error tracking (Sentry, etc.)
5. **Backup**: Implement database backups for lobby data
6. **Load Testing**: Test with many concurrent players
7. **Gas Optimization**: Review and optimize gas costs

## Troubleshooting

### Server won't start
- Check Node.js version: `node --version` (need 18+)
- Check port 3000 is available
- Check `.env` file exists and has required variables

### Contract calls failing
- Verify network is Base Sepolia
- Check wallet has ETH for gas
- Verify contract addresses are correct
- Check RPC URL is accessible

### Balance not updating
- Check server logs for errors
- Verify player is in lobby (check `lobbyManager`)
- Check socket connection is active

### Finalization not working
- Verify operator private key is correct
- Check operator wallet has ETH
- Verify contract operator is set correctly
- Check finalization job is running (every 30 seconds)

## Support Resources

- Base Sepolia Explorer: https://sepolia-explorer.base.org
- Base Docs: https://docs.base.org
- OpenZeppelin Docs: https://docs.openzeppelin.com
- Socket.IO Docs: https://socket.io/docs

---

**Note**: This is a testnet/prototype implementation. Do not use with real funds without proper security audits and legal review.


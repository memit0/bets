# Testing Guide - BetLobby Frontend Integration

## Overview
This guide explains how to test the complete frontend and backend integration for the BetLobby wagering system.

## Prerequisites

1. **Node.js 18+** installed
2. **MetaMask** or another Web3 wallet installed in your browser
3. **Base Sepolia ETH** for gas fees (get from [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-goerli-faucet))
4. **Mock USDC** tokens (deployed contract address in .env)
5. **BetLobby contract** deployed (address in .env)

## Setup

### 1. Environment Configuration

Verify your `.env` file has all required values:

```bash
# Check .env file
cat .env
```

Required values:
- `USDC_ADDRESS` - Mock USDC contract address
- `BET_LOBBY_ADDRESS` - BetLobby contract address
- `OPERATOR_PRIVATE_KEY` - Server wallet private key (needs ETH for gas)
- `FEE_RECIPIENT` - Address to receive 5% fees
- `RPC_URL` - Base Sepolia RPC endpoint
- `CHAIN_ID` - 84532 (Base Sepolia)

### 2. Install Dependencies

```bash
npm install
```

### 3. Build the Project

```bash
npm run build
```

This will:
- Lint all code
- Build client JavaScript (webpack)
- Copy client resources
- Build server code (babel)
- Run tests

### 4. Start the Server

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run watch
```

The server will start on `http://localhost:3000`

## Testing Workflow

### Phase 1: Wallet Connection

1. **Open the Game**
   - Navigate to `http://localhost:3000`
   - You should see the start menu

2. **Connect Wallet**
   - Look for the "Wallet Panel" in the top-left corner
   - Click "Connect Wallet"
   - MetaMask should prompt you to connect
   - Approve the connection

3. **Switch Network**
   - If you're not on Base Sepolia, MetaMask will prompt you to switch
   - Approve the network switch (or add Base Sepolia if needed)

4. **Verify Connection**
   - After connecting, you should see:
     - "Connected" status in green
     - Your address (truncated) displayed
     - Either "Approve 1 USDC" or "Join Lobby" button

**Expected Behavior:**
- ✅ Wallet connects without errors
- ✅ Address is displayed correctly
- ✅ Network switch works (if needed)
- ✅ No console errors

### Phase 2: USDC Approval

**Note:** You need Mock USDC tokens first. If you don't have them, mint some using:

```bash
# Using hardhat console
npx hardhat console --network baseSepolia
const MockUSDC = await ethers.getContractFactory("MockUSDC");
const usdc = MockUSDC.attach("YOUR_USDC_ADDRESS");
await usdc.mint("YOUR_WALLET_ADDRESS", ethers.parseUnits("10", 6)); // Mint 10 USDC
```

1. **Check Allowance**
   - If "Approve 1 USDC" button shows, you need to approve

2. **Approve USDC**
   - Click "Approve 1 USDC"
   - MetaMask will prompt for approval
   - Approve the transaction
   - Wait for confirmation

3. **Verify Approval**
   - After confirmation, button should change to "Join Lobby (1 USDC)"
   - Check console for `[Wallet] Approved` message

**Expected Behavior:**
- ✅ Approval transaction succeeds
- ✅ Button updates to "Join Lobby"
- ✅ No errors in console

### Phase 3: Join Lobby & Deposit

1. **Join Lobby**
   - Click "Join Lobby (1 USDC)"
   - MetaMask will prompt to confirm transaction
   - Approve the transaction
   - Wait for confirmation (check console logs)

2. **Server Verification**
   - Server should detect the `LobbyJoined` event
   - Console should show: `[EventListener] Deposit detected`
   - Player should be added to lobby

3. **Enter Game**
   - Enter your nickname in the input field
   - Click "Play" to start the game
   - The start menu should disappear
   - Game canvas should appear

**Expected Behavior:**
- ✅ Deposit transaction succeeds
- ✅ Server logs deposit confirmation
- ✅ "Deposit confirmed! Welcome to the lobby." message appears in chat
- ✅ Game starts normally
- ✅ No disconnect or kick messages

**Check Server Logs:**
```bash
# You should see:
[EventListener] Deposit detected: 0x... joined lobby ...
[Blockchain] Player 0x... confirmed deposit for lobby ...
[Lobby] Player 0x... joined lobby ... (socket: ...)
[Lobby] Activated lobby ... at ...
```

### Phase 4: Gameplay & Balance Tracking

1. **Game HUD**
   - After joining, the Wallet Panel should be replaced by Game HUD
   - Game HUD should show:
     - Lobby timer (countdown from 5:00)
     - Player balance (starts at 1.00 USDC)
     - Cash Out button (disabled initially)

2. **Play the Game**
   - Move around and eat food
   - Balance should NOT change from eating food
   - Balance ONLY changes when you kill another player

3. **Kill Events**
   - When you kill another player:
     - Your balance increases by their balance
     - Their balance goes to 0
     - Console shows: `[Lobby] Kill in lobby ...`
   - When you get killed:
     - Your balance goes to 0
     - Killer gets your balance

4. **Cash-Out (After 45 Seconds)**
   - After 45 seconds, "Cash Out" button becomes enabled
   - Click to freeze your balance
   - You'll see "Cash-out request processed" message
   - Balance is frozen at current value
   - You can continue spectating but can't play

**Expected Behavior:**
- ✅ Timer counts down from 5:00 to 0:00
- ✅ Balance updates correctly on kills
- ✅ Cash-out button enables after 45s
- ✅ Cash-out freezes balance correctly
- ✅ Balance display updates in real-time

### Phase 5: Lobby Finalization

1. **Lobby End**
   - When timer reaches 0:00, lobby ends
   - Server should automatically finalize lobby within 30 seconds
   - Check server console for finalization logs

2. **Server Finalization Process**
   ```bash
   # Server logs should show:
   [FinalizationJob] Found 1 lobby/lobbies ready for finalization
   [FinalizationJob] Finalizing lobby ...
   [FinalizationJob] Final balances for lobby ...: [...]
   [FinalizationJob] Merkle root for lobby ...: 0x...
   [LobbyStore] Saved lobby ... to ...
   [Blockchain] Finalizing lobby ... (attempt 1/3)
   [Blockchain] Transaction sent: 0x...
   [Blockchain] Transaction confirmed in block ...
   [FinalizationJob] Successfully finalized lobby ... on-chain: 0x...
   ```

3. **Results Modal**
   - After finalization, a modal should appear
   - Modal shows:
     - "Lobby Ended" title
     - Your final balance (after 5% fee deduction)
     - "Claim Winnings" button
     - "Close" button

**Expected Behavior:**
- ✅ Lobby finalizes automatically after timer expires
- ✅ Finalization transaction succeeds on-chain
- ✅ Results modal appears
- ✅ Final balance is correct (your balance minus 5% if positive)

### Phase 6: Claim Winnings

1. **Fetch Claim Data**
   - Click "Claim Winnings"
   - Client fetches Merkle proof from server
   - Button should show "Fetching proof..."

2. **Submit Claim Transaction**
   - MetaMask prompts to confirm claim transaction
   - Approve the transaction
   - Status shows "Transaction pending..."

3. **Claim Confirmation**
   - After confirmation, status shows success message
   - Check your USDC balance in wallet (should increase)
   - Button disappears

**Expected Behavior:**
- ✅ Merkle proof fetched successfully
- ✅ Claim transaction succeeds
- ✅ USDC tokens received in wallet
- ✅ Status updates correctly

**Verify Claim:**
```bash
# Check USDC balance using hardhat console
const usdc = await ethers.getContractAt("IERC20", "USDC_ADDRESS");
const balance = await usdc.balanceOf("YOUR_ADDRESS");
console.log("Balance:", ethers.formatUnits(balance, 6), "USDC");
```

## Multi-Player Testing

### Test Scenario: 3 Players

1. **Setup 3 Wallets**
   - Open 3 browser windows (or use different browsers)
   - Connect different MetaMask accounts in each
   - Give each account USDC and ETH

2. **All Join Same Lobby**
   - Have all 3 players approve and join lobby
   - First player triggers lobby activation
   - All players should see the same timer

3. **Gameplay**
   - Player A kills Player B → A gets B's balance (2 USDC total)
   - Player B is out (0 USDC)
   - Player C cashes out at 1.5 minutes → balance frozen
   - Player A survives → keeps 2 USDC

4. **Expected Final Balances (Before Fee)**
   - Player A: 2.00 USDC
   - Player B: 0.00 USDC
   - Player C: 1.00 USDC
   - Total: 3.00 USDC

5. **Expected Payouts (After 5% Fee)**
   - Player A: 1.90 USDC (2.00 - 0.10 fee)
   - Player B: 0.00 USDC
   - Player C: 0.95 USDC (1.00 - 0.05 fee)
   - Fee Recipient: 0.15 USDC
   - Total: 3.00 USDC

6. **Verification**
   - All players can claim simultaneously
   - Check fee recipient address gets 0.15 USDC
   - Verify contract balance is 0 after all claims

## Testing Timeout Refund

To test the timeout refund mechanism (server failure scenario):

1. **Join a Lobby**
   - Have 2+ players join and deposit

2. **Stop the Finalization Job**
   ```bash
   # Kill the server or disable finalization in code
   ```

3. **Wait for Deadline**
   - Wait 15 minutes after lobby end time
   - This is `FINALIZE_DEADLINE_EXTENSION` (10 min) + `LOBBY_DURATION` (5 min)

4. **Call Timeout Refund**
   ```javascript
   // Using hardhat console
   const betLobby = await ethers.getContractAt("BetLobby", "BET_LOBBY_ADDRESS");
   const tx = await betLobby.timeoutRefund(LOBBY_ID);
   await tx.wait();
   ```

5. **Verify Refund**
   - Each player should get exactly 1 USDC back
   - Check USDC balances

**Expected Behavior:**
- ✅ Timeout refund works after deadline
- ✅ Players get full deposit back
- ✅ Cannot claim timeout refund before deadline
- ✅ Cannot claim timeout refund if lobby finalized

## Common Issues & Troubleshooting

### Issue: "No wallet detected"
**Solution:** Install MetaMask or another Web3 wallet extension

### Issue: "USDC address not configured"
**Solution:** 
- Deploy MockUSDC contract: `npx hardhat run scripts/deploy-mock-usdc.js --network baseSepolia`
- Update `USDC_ADDRESS` in `.env`
- Restart server

### Issue: "Deposit not verified"
**Solution:**
- Wait a few seconds for blockchain confirmation
- Check event listener is running (server logs)
- Verify transaction succeeded on [Base Sepolia Explorer](https://sepolia-explorer.base.org)

### Issue: "Invalid proof" when claiming
**Solution:**
- Verify lobby was finalized
- Check lobby data file exists: `src/server/repositories/lobbies/lobby-{id}.json`
- Ensure address matches exactly (case-insensitive)

### Issue: Timer doesn't start
**Solution:**
- Verify server sent `lobbyEndTime` event
- Check browser console for socket connection
- Ensure player deposit was confirmed

### Issue: Balance not updating
**Solution:**
- Verify both players deposited and are in same lobby
- Check server logs for kill events
- Ensure players are in `active` status

### Issue: Finalization fails
**Solution:**
- Check operator wallet has enough ETH for gas
- Verify `OPERATOR_PRIVATE_KEY` in `.env` is correct
- Check contract address in `.env` is correct
- Review server error logs

## Monitoring & Debugging

### Check Blockchain Events

```bash
# View all events for a lobby
npx hardhat run scripts/check-events.js --network baseSepolia
```

### Check Lobby State (Server)

```bash
# In server console, you can access:
# lobbyManager.getLobby(LOBBY_ID)
# lobbyManager.getPlayer(SOCKET_ID)
```

### Check Saved Lobby Data

```bash
# View finalized lobby data
cat src/server/repositories/lobbies/lobby-{LOBBY_ID}.json
```

### Browser Console

Check for these events:
- `[Config] Loaded:` - Configuration loaded
- `[Wallet] Connected:` - Wallet connected
- `[Lobby] Lobby finalized:` - Finalization received

### Server Console

Watch for these logs:
- `[EventListener] Deposit detected` - Deposit confirmed
- `[Lobby] Player ... joined lobby` - Player added
- `[Lobby] Kill in lobby ...` - Kill event processed
- `[FinalizationJob] Successfully finalized` - Finalization complete

## Performance Benchmarks

Expected performance:
- **Deposit confirmation:** < 10 seconds (Base Sepolia block time)
- **Join lobby latency:** < 200ms (socket communication)
- **Balance update latency:** < 50ms (in-memory update)
- **Finalization delay:** 0-30 seconds after lobby end
- **Finalization gas cost:** ~100k-200k gas
- **Claim gas cost:** ~50k-80k gas per player

## Security Checklist

Before production deployment:

- [ ] Change `OPERATOR_PRIVATE_KEY` to secure key (hardware wallet)
- [ ] Verify contract ownership is set correctly
- [ ] Test with real USDC on mainnet (small amounts first)
- [ ] Audit smart contract code
- [ ] Implement rate limiting on API endpoints
- [ ] Add player cap per lobby
- [ ] Test network disconnect/reconnect scenarios
- [ ] Verify Merkle proof generation is deterministic
- [ ] Test concurrent lobby finalization
- [ ] Monitor operator wallet balance (auto-refill)

## Success Criteria

A successful test run should demonstrate:

1. ✅ Wallet connects and switches to Base Sepolia
2. ✅ USDC approval transaction succeeds
3. ✅ Deposit transaction succeeds and is detected by server
4. ✅ Player can join game after deposit confirmation
5. ✅ Game HUD displays timer and balance correctly
6. ✅ Balance updates correctly on kill events
7. ✅ Cash-out freezes balance after grace period
8. ✅ Lobby finalizes automatically when timer expires
9. ✅ Results modal appears with correct final balance
10. ✅ Player can claim winnings successfully
11. ✅ USDC tokens are received in wallet
12. ✅ Multiple players can participate simultaneously
13. ✅ Fee calculation is correct (5% of positive balances)
14. ✅ No funds are lost or stuck in contract

## Next Steps

After successful testing:

1. **Deploy to Production**
   - Use mainnet Base or Arbitrum
   - Deploy with real USDC
   - Set appropriate player caps and fee rates

2. **Add Features**
   - Lobby browser/list
   - Player statistics and leaderboards
   - Tournament modes
   - Referral system

3. **Monitoring**
   - Set up Tenderly alerts
   - Monitor operator wallet balance
   - Track successful/failed finalizations
   - Log player feedback

4. **Documentation**
   - User guide for players
   - API documentation
   - Deployment guide



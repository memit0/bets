# Quick Reference Guide - BetLobby Frontend

## 🚀 Quick Start

```bash
# 1. Build
npm run build

# 2. Start server
npm start

# 3. Open browser
http://localhost:3000
```

## 📁 Key Files Modified

- ✅ `src/client/css/main.css` - Added wallet panel, HUD, and modal styles
- ✅ `src/client/js/app.js` - Added cash-out grace period logic  
- ✅ `src/client/js/global.js` - Added lobby state variables
- ✅ `TESTING_GUIDE.md` - Comprehensive testing documentation (NEW)
- ✅ `FRONTEND_INTEGRATION_SUMMARY.md` - Complete integration summary (NEW)

## 🎮 Player Flow

1. **Connect Wallet** → MetaMask connects to Base Sepolia
2. **Approve USDC** → Allow BetLobby to spend 1 USDC
3. **Join Lobby** → Deposit 1 USDC to contract
4. **Play Game** → Kill players to win their balances
5. **Cash Out** (optional) → Freeze balance after 45 seconds
6. **Claim Winnings** → Receive payout when lobby ends

## 🕹️ UI Elements

### Wallet Panel (Before joining)
- Wallet connection status
- Wallet address (truncated)
- "Connect Wallet" button
- "Approve 1 USDC" button
- "Join Lobby" button
- Error messages

### Game HUD (During game)
- Lobby timer (5:00 countdown)
- Player balance (USDC)
- "Cash Out" button (enabled after 45s)

### Results Modal (After game)
- Final balance display
- "Claim Winnings" button
- Claim status messages
- "Close" button

## 🔑 Key Configuration

`.env` file must contain:
```bash
USDC_ADDRESS=0x...          # Mock USDC contract
BET_LOBBY_ADDRESS=0x...     # BetLobby contract
OPERATOR_PRIVATE_KEY=0x...  # Server wallet (needs ETH)
FEE_RECIPIENT=0x...         # Fee destination address
RPC_URL=https://sepolia.base.org
CHAIN_ID=84532
```

## 📊 Game Mechanics

| Event | Effect |
|-------|--------|
| Join lobby | Deposit 1 USDC, balance = 1.00 |
| Kill player | Gain their entire balance |
| Get killed | Lose entire balance (0.00) |
| Cash out | Freeze current balance |
| Lobby ends | 5% fee deducted from positive balances |

## ⏱️ Timing

- **Lobby Duration**: 5 minutes
- **Cash-Out Grace**: 45 seconds (button disabled)
- **Finalization**: Automatic after timer expires
- **Deadline**: 15 minutes max (or timeout refund)

## 🔗 API Endpoints

Server provides:
- `GET /api/config` - Contract addresses and chain ID
- `GET /lobbies/:id/claims/:address` - Merkle proof for claiming
- `GET /lobbies/:id` - Lobby information

## 💰 Fee Structure

- **Deposit**: 1 USDC (no fee)
- **Gameplay**: No fees
- **Payout**: 5% fee on positive balances only
- **Example**: 2.00 USDC → Pay 1.90, Fee 0.10

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| No wallet detected | Install MetaMask |
| Wrong network | Switch to Base Sepolia |
| Deposit not verified | Wait 10-20 seconds for confirmation |
| Timer not starting | Verify deposit was confirmed |
| Can't claim | Check lobby was finalized |

## 📝 Testing Checklist

- [ ] Wallet connects successfully
- [ ] USDC approval works
- [ ] Deposit transaction confirms
- [ ] Game starts after deposit
- [ ] Timer counts down correctly
- [ ] Balance updates on kills
- [ ] Cash-out works after 45s
- [ ] Lobby finalizes automatically
- [ ] Results modal appears
- [ ] Claim succeeds and USDC received

## 🔍 Monitoring

### Browser Console
```javascript
// Check wallet status
window.walletManager.isConnected

// Check lobby state
global.lobbyEndTime
global.playerBalance
```

### Server Logs
```bash
# Watch for these messages:
[EventListener] Deposit detected
[Lobby] Player ... joined lobby
[Lobby] Kill in lobby ...
[FinalizationJob] Successfully finalized
```

## 📚 Documentation

- **Full Testing**: See `TESTING_GUIDE.md`
- **Integration Details**: See `FRONTEND_INTEGRATION_SUMMARY.md`
- **Project Overview**: See `project-overview.md`
- **Setup Guide**: See `SETUP_GUIDE.md`

## ⚡ Common Commands

```bash
# Development (auto-reload)
npm run watch

# Production build
npm run build

# Run tests
npm test

# Deploy contracts
npx hardhat run scripts/deploy.js --network baseSepolia

# Check events
npx hardhat console --network baseSepolia
```

## 🎯 Next Steps

1. Follow `TESTING_GUIDE.md` for comprehensive testing
2. Test with multiple players
3. Verify all edge cases
4. Deploy to production when ready

## ✅ Status

**Integration Status**: ✅ **COMPLETE**

All frontend components are implemented and ready for testing:
- Wallet connection ✅
- USDC approval ✅  
- Lobby joining ✅
- Game HUD ✅
- Balance tracking ✅
- Cash-out ✅
- Results modal ✅
- Claiming ✅

---

For detailed information, see:
- `TESTING_GUIDE.md` - Step-by-step testing
- `FRONTEND_INTEGRATION_SUMMARY.md` - Technical details



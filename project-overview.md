# Project Overview – Bets (Trustless Agar-Style Wagering)

## 1. Abstract
Players want to wager real value on arcade-style matches but existing options rely on informal middlemen or centralized services that can stall, cheat, or be banned. Bets demonstrates a web-based Agar.io fork where players deposit 1 USDC into a smart-contract escrow, play a five-minute lobby, and receive on-chain payouts that reflect their final in-game balance. Blockchain settlement removes trust in payouts and custody, while the traditional Node.js/socket-based server continues to run all gameplay logic off-chain.

## 2. Problem & Context
- Traditional wagers depend on centralized custodians that can disappear, misallocate funds, or violate platform policies.
- Game studios rarely offer native wagering; third-party overlays introduce compliance and security risks.
- Smart contracts provide verifiable escrow but need to be paired with low-latency game loops; Layer 2 networks (Base/Arbitrum) make sub-dollar stakes viable.
- Inspired by successful off-chain/on-chain hybrids (Dark Forest, Loot Survivor) and EIP-712 typed data signing for efficient attestations.

## 3. Solution Summary
1. **Client (`src/client`)** – HTML5/Canvas Agar fork + wallet panel. Handles account connection, deposit UX, in-game HUD (balance, timer, cash-out request button), and end-of-match claim UI.
2. **Server (`src/server`)** – Node.js + Express + Socket.IO. Orchestrates lobbies, tracks balances, enforces five-minute cap, records cash-out requests, builds Merkle roots, and submits final root to contract through a relayer.
3. **Smart Contract (`contracts/BetLobby.sol`, to be created)** – ERC20 escrow for 1 USDC deposits, per-lobby state machine, Merkle-based claims after finalization, timeout refunds if the server disappears.
4. **Shared Config (`config.js`, `.env`)** – exposes map size, lobby id, RPC endpoints, USDC address, contract address, and admin keys.

All payouts occur once per lobby at the end of the five-minute window. “Cash-out” only freezes a player’s balance server-side; it does **not** trigger a contract withdrawal until the lobby finalizes. For initial testing there is no player cap; the lobby starts with the first depositor and runs until the timer expires.

## 4. End-to-End Lifecycle (Implementation Ready)
1. **Player loads client** (`src/client/index.html` & `js/app.js`):
   - Detect `window.ethereum`. Prompt to connect wallet and switch to target testnet.
   - Call `allowance` on the USDC token; if insufficient, show “Approve 1 USDC” CTA.
2. **Join / Deposit**:
   - After approval, call `joinLobby(uint256 lobbyId)` on `BetLobby` contract to transfer 1 USDC into escrow (`transferFrom`).
   - Client waits for confirmation, then emits `playerDepositConfirmed` via Socket.IO so the server knows the player is eligible.
3. **Server lobby orchestration** (`src/server/server.js` & `game-logic.js`):
   - Maintain `LobbyState` object (see §6) keyed by a deterministic `lobbyId` (e.g., current epoch bucket).
   - When the **first** paid player joins, mark lobby `Active`, store `startTime = now`, and schedule `endTime = startTime + 5 minutes`.
   - Server sends initial spawn + mass via existing socket messages (`welcome`, `playerJoin`).
4. **Gameplay & Balance tracking**:
   - Each kill event (already emitted in `game-logic`) updates both killer’s `balance` and victim’s `balance` within `LobbyState.balances`.
   - Balances are denominated in “USDC-equivalent mass”: `balance = 1e6 + earnedMass - fee`.
   - Apply 5 % ops fee once on each positive balance when lobby finalizes.
5. **Cash-out request (mid-game exit)**:
   - Player hits “Cash Out” button; client emits `cashOutIntent`.
   - Server checks: lobby active, at least `cashOutGraceSeconds` elapsed (30–60 s), player alive.
   - Server records `balances[playerId].status = "frozen"` and sets `freezeValue`.
   - Player continues spectating (or is removed) but payout is delayed until lobby finalization.
6. **Lobby end**:
   - Triggered when `Date.now() >= endTime` or admin marks lobby unhealthy (for MVP there is no “remaining players” condition).
   - Server stops accepting inputs, snapshots `finalBalances[]` (address, amount) including:
     - Alive players (current mass converted to amount).
     - Dead players (0).
     - Frozen cash-out players (their `freezeValue`).
   - Build deterministic array sorted by address, compute Merkle tree, persist `{root, leaves, salt}` to disk (`repositories` folder) for reproducibility.
   - Submit `finalizeLobby(lobbyId, merkleRoot, totalBankroll, ipfsHashOptional)` through backend relayer wallet.
7. **Player payout**:
   - Once `LobbyFinalized` event fires, client displays “Claim Winnings” modal.
   - Player fetches their leaf + proof from backend endpoint (`GET /lobbies/:id/claims/:address`).
   - Call `claim(lobbyId, amount, proof)` directly in wallet; contract releases funds.
8. **Timeout refund**:
   - If server fails to finalize within `FINALIZE_DEADLINE = startTime + 15 minutes`, any depositor can call `timeoutRefund(lobbyId)` to get their 1 USDC back.

## 5. Functional Requirements (Expanded)
1. **Wallet & Deposit**
   - Only ERC20 (USDC) accepted; decimals = 6.
   - `joinLobby` reverts if lobby already `Finalized` or `Settled`.
2. **Lobby State Machine**
   - `Waiting` (no deposits) → `Active` (timer running) → `Finalizable` (timer hit) → `Finalized` (root stored) → `Settled` (all funds claimed or timeout).
3. **Balances**
   - Start at 1 USDC per player.
   - Killing another player transfers their *entire* balance to killer.
   - Death sets balance to 0.
   - Cash-out freeze stores balance but keeps in pool until settlement.
4. **Fees**
   - Optional 5 % commission from positive balances when finalizing; directed to `feeRecipient`.
5. **Security**
   - Server never has custody; it only proves final results.
   - Contract verifies Merkle proofs and rejects duplicate claims.
   - Emergency pause in contract to stop new lobbies if exploit discovered.

## 6. Smart Contract Specification (`contracts/BetLobby.sol`)
### State
```solidity
struct Lobby {
    uint64 startTime;
    uint64 endTime;           // startTime + 5 min
    uint64 finalizeDeadline;  // endTime + 10 min
    uint8 state;              // 0 Waiting, 1 Active, 2 Finalized
    bytes32 merkleRoot;       // set at finalize
    uint96 totalDeposits;     // sum of 1 USDC deposits
    uint96 totalClaimed;
}
mapping(uint256 => Lobby) public lobbies;
mapping(uint256 => mapping(address => bool)) public claimed;
IERC20 public immutable token;       // USDC
address public operator;             // server signer
address public feeRecipient;
uint16 public feeBps = 500;          // 5%
```

### Functions
1. `joinLobby(uint256 lobbyId)`  
   - Transfers exactly 1 USDC via `transferFrom`.  
   - If lobby `state == 0`, set `startTime = block.timestamp`, `endTime = startTime + 300`, `finalizeDeadline = endTime + 600`, and `state = 1`.  
   - `totalDeposits += 1e6`.
2. `finalizeLobby(uint256 lobbyId, bytes32 root, uint96 totalPayout, uint96 feeAmount)`  
   - `msg.sender` must be `operator`.  
   - Require `block.timestamp >= lobbies[lobbyId].endTime`.  
   - `root` saved, `state = 2`, emit `LobbyFinalized`.  
   - `feeAmount` transferred to `feeRecipient`; must match `feeBps` over winning balances.  
   - `totalPayout + feeAmount` must equal `totalDeposits`.
3. `claim(uint256 lobbyId, address player, uint96 amount, bytes32[] proof)`  
   - Verify lobby `state == 2`, `!claimed[lobbyId][player]`.  
   - Leaf = `keccak256(abi.encode(player, amount))`.  
   - Verify against stored root.  
   - Transfer `amount` USDC to `player`, mark as claimed, update `totalClaimed`.
4. `timeoutRefund(uint256 lobbyId, address player)`  
   - Allowed when `block.timestamp > finalizeDeadline` and lobby not finalized.  
   - Transfers 1 USDC back to caller if they deposited (tracked via off-chain mapping + events).
5. Admin helpers: `setOperator`, `setFeeRecipient`, `setFeeBps`, `pause`, `unpause`.

### Events
```
event LobbyJoined(uint256 indexed lobbyId, address indexed player);
event LobbyActivated(uint256 indexed lobbyId, uint64 startTime, uint64 endTime);
event LobbyFinalized(uint256 indexed lobbyId, bytes32 merkleRoot, uint96 totalPayout);
event Claimed(uint256 indexed lobbyId, address indexed player, uint96 amount);
event TimeoutRefund(uint256 indexed lobbyId, address indexed player);
```

## 7. Backend Implementation Notes (`src/server`)
- **New modules**:
  - `src/server/blockchain/contract-client.js`: wraps ethers.js provider, contract ABI, and writes (`finalizeLobby`).
  - `src/server/repositories/lobby-store.js`: persists lobby snapshots & Merkle data to disk (JSON per lobby).
  - `src/server/routes/lobbies.js`: REST endpoint returning claim data.
- **Lobby state tracking** (`game-logic.js` / `server.js`):
  - Extend `Player` object with `address`, `depositTx`, `balance`.
  - Maintain `LobbyState` object:
    ```js
    {
      id,
      startTime,
      endTime,
      players: Map<socketId, PlayerState>,
      balances: Map<address, {amount, status}>,
      cashOutGraceSeconds: 45
    }
    ```
  - Hook existing events (`playerSpawn`, `playerEject`, `playerSplit`, `playerEaten`) to update balances.
- **Blockchain event listener**:
  - Watch `LobbyJoined` event to verify deposits before letting a socket join.
- **Merkle builder**:
  - Reuse library like `merkletreejs`.  
  - Deterministic leaf order: sorted ascending by `address`.
  - Save `{leafValues, proofs}` so clients can fetch later.
- **Finalize job**:
  - Cron-style check: when lobby `endTime` <= now and not finalized, call `finalizeLobby`.
  - Handle retries/exponential back-off if transaction fails.

## 8. Client Implementation Notes (`src/client/js`)
- **Wallet Panel (`app.js`)**
  - Add `connectWallet()`, `approveUsdc()`, `joinLobby()` functions using ethers.js injected provider.
  - Display connection status within existing HUD.
- **Deposit UX (`global.js`, `canvas.js`)**
  - Show “Funds locked until lobby ends” info.
  - After `joinLobby` tx, emit `socket.emit('playerDepositConfirmed', { address, txHash })`.
- **In-Game HUD (`render.js`)**
  - Display:
    - Countdown timer (derived from server `lobbyEndTime` message).
    - Current balance.
    - Cash-out button (disabled until grace period). On click -> `socket.emit('cashOutIntent')`.
- **Results Screen (`app.js`)**
  - After receiving `lobbyFinalized` socket event, show final balance and “Claim” button.
  - Fetch Merkle proof via `fetch('/lobbies/<id>/claims/<address>')`, pre-fill contract call parameters for wallet.
- **Error Handling**
  - Display statuses for pending blockchain tx, finalize fail, claim success/failure.

## 9. Methodology & Implementation Plan
1. **Week 1** – Implement smart contract + Foundry tests, deploy to Base Sepolia; scaffold ethers.js wrapper.
2. **Week 2** – Integrate wallet/deposit flow in client; add blockchain watcher to server.
3. **Week 3** – Implement balance tracking, cash-out freeze, Merkle finalize, backend REST for proofs.
4. **Week 4** – UI polish, QA (simulated matches, timeout scenario), monitoring/metric dashboards, documentation.

## 10. Scope & Deliverables
- Fully playable Agar fork reachable at configured domain.
- Verified smart contract + deployment scripts.
- Backend relayer + Merkle proof service.
- Frontend wallet UX and claim experience.
- Technical documentation (this file + `project-plan.md`) enabling future contributors to extend.
- **Out of scope:** generalized SDK for other games, real-money production launch, compliance tooling.

## 11. Evaluation
- Join flow: at least three wallets join, deposit recorded, lobby starts instantly.
- Gameplay: kill/cash-out events reflected in balances and final payouts.
- Finalization: single transaction containing Merkle root, all players able to claim.
- Timeout refund tested by disabling finalizer and waiting for 15-minute deadline.
- Performance: <150 ms input latency in LAN simulation; contract gas <500k for finalize, <80k per claim.

## 12. Resources
- Tooling: Node.js 18+, npm, Hardhat or Foundry, ethers.js, Socket.IO.
- Infrastructure: Base/Arbitrum testnet RPC (Alchemy/Infura), faucet-provided USDC, relayer wallet with ETH for gas.
- Monitoring: Tenderly or Blockscout for contract events, Winston logs for server, browser devtools for client.

## 13. Challenges & Mitigations
- **Smart contract exploits:** mitigate via audits, unit/integration tests, use OpenZeppelin libraries.
- **Server dishonesty:** publish lobby snapshots + proofs to IPFS; players can audit Merkle leaves.
- **Low liquidity / empty lobbies:** optionally inject bots that do not hold balances; consider entry fee adjustments later.
- **Regulation:** keep deployment on testnets, label project as educational prototype, avoid real-money messaging.
- **User onboarding:** provide faucet links, UI copy explaining deposits and payout timing.

## 14. Ethics
- No personal data collected beyond wallet addresses and gameplay telemetry.
- Intellectual property: Agar assets reused only where license permits; custom branding recommended before public launch.
- Responsible messaging: highlight that prototype is for demonstration, not gambling deployment; real-world release would require KYC/age verification and legal review.

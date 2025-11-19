# Parallel Execution & Codex Orchestration

This document explains how to coordinate multiple agents (human or Codex) working in parallel on the Bets project. It focuses on clear swim lanes, shared expectations, and the mechanics for running concurrent Codex sessions without stepping on each other.

---

## 1. Workstream Overview

| Track | Issues | Ownership | Primary Outputs |
| --- | --- | --- | --- |
| **Smart Contracts & Deployment** | #2, #3 | Contract specialist | `contracts/BetLobby.sol`, Foundry/Hardhat tests, deploy scripts, env docs |
| **Server & Relayer** | #4, #5, #6, #7 | Backend specialist | Lobby state machine, blockchain client, Merkle builder, finalize job |
| **Client & E2E/Docs** | #8, #9, (support #1) | Frontend specialist | Wallet UX, HUD, claim flow, Cypress e2e, observability/docs |

Each track should branch independently (`feature/contracts`, `feature/server`, `feature/client`) and open PRs referencing the relevant issues. Use `issue-<n>-short-description` branches when one track spans multiple issues.

---

## 2. Shared Interfaces & Checkpoints

1. **Contract ABI** (Track 1)  
   - Publish preliminary ABI + events in `docs/abi.md` before backend/client work begins.  
   - Update the doc whenever function signatures change; ping other tracks.

2. **Socket & REST schema** (Track 2)  
   - Document `playerDepositConfirmed`, `cashOutIntent`, finalize events, and `/lobbies/:id/claims/:address` response format in `docs/protocol.md`.  
   - Notify Track 3 when schemas stabilize.

3. **Proof payloads** (Tracks 2 & 3)  
   - Agree on JSON shape for claims (address, amount, proof[], salt) and record examples.

4. **Weekly syncs**  
   - 15-minute async summary per track (Slack/issue comment) every Mon/Thu covering done, next, blockers.

---

## 3. Codex Workflow

### 3.1 Launching Agents

Run each task in its own Codex session to avoid context collisions:

```bash
codex run --repo /Users/mehmetbattal/Desktop/projects/bets \
  --issue 4 --branch feature/server-contract-client
```

Recommended flags:

- `--issue <n>` to auto-load GitHub issue context.
- `--branch <name>` so Codex checks out a dedicated branch before editing.
- `--plan` to enable the planning tool for non-trivial tasks (default in most sessions).

> Tip: If sessions run concurrently, double-check `git status` before switching tracks to prevent cross-branch edits.

### 3.2 Agent Handoff Pattern

1. **Initialize session** with `git pull` and `npm install` only if dependencies change.  
2. **Attach issue context** to Codex prompt (include acceptance criteria).  
3. **Work within scope**; when a dependency is needed from another track, leave a TODO comment referencing the blocking issue.  
4. **Before exiting**, agent must:
   - Run relevant tests for the touched area.  
   - Post a summary in the GitHub issue (copy/paste from Codex final message).  
   - Push the branch or leave instructions in the issue.

---

## 4. Testing Responsibilities

| Track | Minimum Tests per PR |
| --- | --- |
| Contracts | `forge test`/`hardhat test`, gas report, static analysis |
| Server | Unit/integration tests via Jest + socket.io-client, mocked blockchain client |
| Client | Unit tests (if applicable) + Cypress/Playwright path for wallet join → claim |
| Shared | `npm run lint`, `npm run test` (aggregated), manual smoke run described in README |

Codex agents should run only the relevant subset to save time but must document skipped suites in PR/issue comments (e.g., “Skipped Cypress e2e; requires browser env”).

---

## 5. Communication Templates

**Issue update template**
```
Status: In progress
Work: Implemented XYZ (link to PR/commit)
Tests: npm run lint, forge test
Next: Need backend schema confirmation (see #6)
```

**Cross-track dependency ping**
```
@backend-team Need final /lobbies claims schema by EOD to unblock client claim modal (issue #8). Current assumption: { address, amount, proof[], lobbyId }.
```

Keep updates concise; Codex agents can copy templates into their final responses for consistency.

---

## 6. Scheduling Checklist

- [ ] Kickoff meeting to confirm owners, branches, and deadlines.
- [ ] Track 1 publishes ABI draft before Track 2 starts Merkle work.
- [ ] Track 2 exposes mock REST endpoint before Track 3 integrates claim flow.
- [ ] Track 3 finishes Cypress suite; run once combined backend/client branch is available.
- [ ] Final integration rehearsal (issue #9) after all PRs merged into `main`.

---

## 7. Escalation & Risk Mitigation

- If two tracks need the same file (e.g., shared config), coordinate via PR stacking or feature flags.  
- Use feature toggles or env flags so incomplete functionality doesn’t block other teams.  
- Tag `@project-lead` when scope creeps or dependencies slip more than a day; adjust priorities.

---

Following this guide keeps Codex sessions scoped, ensures agents know where to push updates, and gives human collaborators a predictable rhythm even when work happens in parallel. Update this document as processes evolve.

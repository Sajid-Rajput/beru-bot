# Smart Profit Service — Working Architecture

## 1) Purpose

Smart Profit Service is an event-driven Solana automation engine that:
- watches token buy activity,
- decides if a configured smart-profit order should react,
- executes a sell through Jupiter using an ephemeral wallet,
- recovers funds safely if execution is interrupted,
- and keeps order watch-state aligned with token market-cap conditions.

This document is architecture-only (runtime components + service interactions), intentionally excluding API and script-level details.

---

## 2) Architecture at a Glance

```mermaid
graph TB
  subgraph External Systems
    QN_STREAM[QuickNode Streams\nWebhook Feed]
    QN_KV[QuickNode KV\nWatched Token Set]
    QN_STREAMS_API[QuickNode Streams API\nPause/Resume]
    JUPITER[Jupiter Aggregator]
    DEXSCREENER[DexScreener]
    SOLANA_RPC[Solana RPC]
    CALLBACK[Notification Callback]
  end

  subgraph Smart Profit Service
    TW[TransactionWatcherService]
    SO[SellOrchestratorService]
    SE[SellExecutorService]
    MCM[MarketCapMonitorService]
    ERW[EphemeralRecoveryWorker]
    NS[NotificationService]
  end

  subgraph Persistence
    MONGO[(MongoDB)]
    REDIS[(Redis)]
  end

  QN_STREAM -->|signed webhook| TW
  TW -->|buy events| SO
  SO -->|queued sell tasks| SE
  SE --> JUPITER
  SE --> SOLANA_RPC
  MCM --> DEXSCREENER
  MCM --> QN_KV
  MCM --> QN_STREAMS_API
  SE --> NS
  MCM --> NS
  NS --> CALLBACK

  TW --> MONGO
  SO --> MONGO
  SE --> MONGO
  MCM --> MONGO
  ERW --> MONGO

  TW --> REDIS
  SO --> REDIS
  NS --> REDIS
```

---

## 3) Core Runtime Services

### 3.1 TransactionWatcherService

**Responsibility**
- Ingests QuickNode webhook transactions.
- Verifies authenticity (security token/HMAC flow in adapter layer).
- Deduplicates events (Redis-backed TTL dedup).
- Parses swap direction and token context.
- Emits normalized `buy` events for downstream orchestration.

**Core dependencies**
- `StreamsWebhookAdapter`
- `TransactionParser`
- `TransactionDeduplicator`
- `orderRepository` (to refresh watched tokens)

**Runtime behavior**
- Starts webhook server.
- Maintains in-memory watched token set.
- Periodically refreshes watched tokens from database.
- Emits typed internal events (`buy`, `started`, `stopped`, `error`).

---

### 3.2 SellOrchestratorService

**Responsibility**
- Converts buy events into controlled sell executions.
- Applies order-level eligibility checks:
  - whitelist wallet skip,
  - minimum buy amount threshold,
  - order activity/watch eligibility.
- Prevents duplicate concurrent execution via Redis distributed lock.
- Enqueues execution with bounded concurrency.

**Core dependencies**
- `orderRepository`
- `sellExecutorService`
- shared Redis client (`getSharedRedis`)
- `PQueue` for concurrency control

**Runtime behavior**
- Lock key pattern: `smart-profit:sell-lock:<orderId>`.
- Randomized sell percentage within order min/max range.
- Fire-and-forget queueing with centralized queue error handling.

---

### 3.3 SellExecutorService

**Responsibility**
- Executes the actual on-chain sell using an ephemeral wallet strategy.
- Performs preflight checks, wallet funding, Jupiter swap, and post-swap sweep.
- Updates transaction/order persistence and emits notifications.

**Core dependencies**
- Solana Web3 connection
- `jupiterAdapter`
- `orderRepository`
- `transactionRepository`
- `ephemeralWalletRepository`
- encryption utilities (wallet key decrypt)
- `notificationService`

**Execution strategy**
1. Decrypt main wallet private key.
2. Validate minimum SOL + token balance.
3. Calculate sell amount from configured percentage.
4. Generate and persist ephemeral wallet.
5. Fund ephemeral wallet (token + SOL fee budget).
6. Attempt Jupiter swap (primary constrained route / fallback route).
7. Sweep remaining SOL from ephemeral wallet back to main wallet.
8. Persist results and transition order state.
9. Notify external system.

**Safety behavior**
- If sweep fails after successful swap, ephemeral wallet is marked for recovery (`RECOVERY_NEEDED`) and handled asynchronously by recovery worker.

---

### 3.4 MarketCapMonitorService

**Responsibility**
- Governs whether orders should actively watch transactions based on market-cap conditions.
- Reconciles desired watched token set with QuickNode KV.
- Auto-manages stream lifecycle (pause/resume) based on effective watchlist.

**Core dependencies**
- `orderRepository`
- `notificationService`
- `QuickNodeKVService`
- `QuickNodeStreamsService`

**Dual-loop model**
- **Hot loop (short interval):** fetch market-cap from DexScreener and update order watch state.
- **Cold loop (longer interval):** KV reconciliation + stream status management.

**Stability controls**
- Hysteresis percentage to prevent watch-state flapping around threshold.
- Single-flight guards to avoid overlapping loop executions.
- Failure-throttled warning strategy for noisy external outages.

---

### 3.5 EphemeralRecoveryWorker

**Responsibility**
- Periodically recovers stale/incomplete ephemeral wallets.
- Prevents fund loss from mid-execution interruption scenarios.

**Core dependencies**
- Solana Web3 connection
- `ephemeralWalletRepository`
- encryption utilities

**Recovery actions**
- Find stale wallets in recoverable states.
- Decrypt ephemeral wallet.
- Return remaining token balance to main wallet.
- Close token account when possible.
- Sweep remaining SOL to main wallet.
- Mark wallet as `RECOVERED` or `FAILED` (after max attempts).

---

### 3.6 NotificationService

**Responsibility**
- Sends external callback notifications for significant lifecycle events:
  - sell confirmed/failed,
  - order activated/paused/completed/error.

**Core dependencies**
- shared Redis client (idempotency)
- callback endpoint config + shared secret

**Reliability controls**
- Redis-backed deduplication keying.
- HMAC-SHA256 request signing.
- retry with exponential backoff.

---

## 4) End-to-End Working Flow

```mermaid
sequenceDiagram
  participant QN as QuickNode Stream
  participant TW as TransactionWatcherService
  participant SO as SellOrchestratorService
  participant SE as SellExecutorService
  participant JP as Jupiter
  participant RPC as Solana RPC
  participant ERW as EphemeralRecoveryWorker
  participant DB as MongoDB
  participant NS as NotificationService

  QN->>TW: Signed webhook transactions
  TW->>TW: verify + dedup + parse + watched-token filter
  TW->>SO: emit buy event

  SO->>DB: fetch active token orders
  SO->>SO: whitelist/min-buy checks
  SO->>SO: acquire Redis order lock
  SO->>SE: enqueue sell execution

  SE->>DB: mark order executing + create tx record
  SE->>RPC: pre-check balances
  SE->>DB: create ephemeral wallet record
  SE->>RPC: fund ephemeral wallet
  SE->>JP: quote + swap instructions
  SE->>RPC: simulate/send/confirm swap
  SE->>RPC: sweep SOL back to main wallet
  SE->>DB: persist results + update order state
  SE->>NS: notify outcome

  alt sweep failure
    SE->>DB: mark ephemeral RECOVERY_NEEDED
    ERW->>DB: pick stale recovery-needed wallets
    ERW->>RPC: recover tokens/SOL
    ERW->>DB: mark RECOVERED/FAILED
  end
```

---

## 5) Order and Wallet State Architecture

### 5.1 Smart Profit Order State Machine

```mermaid
stateDiagram-v2
  [*] --> PENDING
  PENDING --> WATCHING: marketCap >= target
  WATCHING --> EXECUTING: buy trigger accepted
  EXECUTING --> WATCHING: sell succeeded, balance remains
  EXECUTING --> COMPLETED: token balance exhausted
  WATCHING --> PAUSED: marketCap below hysteresis floor
  PAUSED --> WATCHING: marketCap >= target
  EXECUTING --> PAUSED: insufficient SOL or no token balance
  PAUSED --> CANCELLED: user/system stop condition
  WATCHING --> CANCELLED: user/system stop condition
  PENDING --> CANCELLED: user/system stop condition
  COMPLETED --> [*]
  CANCELLED --> [*]
```

### 5.2 Ephemeral Wallet State Machine

```mermaid
stateDiagram-v2
  [*] --> CREATED
  CREATED --> FUNDED
  FUNDED --> SWAPPING
  SWAPPING --> COMPLETED

  FUNDED --> RECOVERY_NEEDED
  SWAPPING --> RECOVERY_NEEDED
  RECOVERY_NEEDED --> RECOVERED
  RECOVERY_NEEDED --> FAILED: max attempts exceeded

  COMPLETED --> [*]
  RECOVERED --> [*]
  FAILED --> [*]
```

---

## 6) Data Architecture (Core Relationships)

```mermaid
erDiagram
  SMART_PROFIT_ORDER ||--o{ SELL_TRANSACTION : has
  SMART_PROFIT_ORDER ||--o{ EPHEMERAL_SELL_WALLET : spawns
  IMPORTED_WALLET ||--o| SMART_PROFIT_ORDER : assigned_to

  SMART_PROFIT_ORDER {
    ObjectId _id
    number userId
    number telegramId
    string tokenMint
    number targetMarketCapUSD
    number minSellPercentage
    number maxSellPercentage
    number minBuyAmountSOL
    string status
    boolean isWatchingTransactions
    number lastMarketCapUSD
    number totalSoldAmount
    number totalSolReceived
  }

  SELL_TRANSACTION {
    ObjectId _id
    ObjectId orderId
    string triggerTxSignature
    number tokenAmountSold
    number solAmountReceived
    string sellTxSignature
    string status
  }

  EPHEMERAL_SELL_WALLET {
    ObjectId _id
    ObjectId orderId
    string publicKey
    string privateKeyEncrypted
    string status
    string tokenMint
    string mainWalletPublicKey
    number attempts
  }

  IMPORTED_WALLET {
    ObjectId _id
    number telegramId
    string walletPublicKey
    string walletPrivateKeyEncrypted
    boolean isAssigned
    ObjectId assignedOrderId
  }
```

---

## 7) Boot and Shutdown Architecture

### Boot sequence

```mermaid
flowchart TD
  A[Load env + validate config] --> B[Connect MongoDB]
  B --> C[Load initial watching orders]
  C --> D[Start TransactionWatcherService]
  D --> E[Wire buy events to SellOrchestrator]
  E --> F[Start EphemeralRecoveryWorker]
  F --> G{Run monitor in main process?}
  G -->|Yes| H[Start MarketCapMonitorService]
  G -->|No| I[Skip in-process monitor]
  H --> J[Service runtime active]
  I --> J[Service runtime active]
```

### Graceful shutdown

```mermaid
flowchart TD
  S[Signal SIGTERM/SIGINT] --> A[Stop MarketCapMonitor]
  A --> B[Stop EphemeralRecoveryWorker]
  B --> C[Stop TransactionWatcher]
  C --> D[Drain/stop SellOrchestrator queue]
  D --> E[Disconnect MongoDB]
  E --> F[Disconnect shared Redis]
  F --> G[Exit process]
```

---

## 8) External Dependency Matrix

| External System | Used By | Architectural Purpose |
|---|---|---|
| Solana RPC | SellExecutor, RecoveryWorker | Balance checks, tx simulation/submission/confirmation |
| Jupiter Aggregator | SellExecutor (via adapter) | Route and build swap instructions |
| QuickNode Streams | TransactionWatcher | Real-time transaction intake |
| QuickNode KV | MarketCapMonitor | Canonical watched token set for stream filtering |
| QuickNode Streams API | MarketCapMonitor | Automatic stream pause/resume |
| DexScreener | MarketCapMonitor | Market-cap based activation control |
| MongoDB | All core services | Source of truth for orders, transactions, ephemeral wallets |
| Redis | Watcher/Orchestrator/Notifier | Deduplication, distributed locks, idempotency |
| Callback endpoint | NotificationService | External event propagation |

---

## 9) Reliability and Security Patterns

- **Repository Pattern**: all data mutations/queries pass through repository layer.
- **Adapter Pattern**: external providers abstracted behind service adapters.
- **Event-Driven Internal Contract**: watcher emits normalized buy events.
- **Distributed Locking**: per-order Redis lock prevents duplicate concurrent sells.
- **Idempotent Notification Delivery**: Redis keying avoids duplicate outbound events.
- **Ephemeral Wallet Isolation**: execution path isolates main wallet from swap path.
- **Recovery-First Design**: incomplete operations are recoverable by background worker.
- **Hysteresis Control**: stable market-cap transitions without status flapping.
- **Backoff + Retry**: resilient handling of transient provider faults.
- **Graceful Shutdown**: queue drain + timer stop + storage disconnect for clean exits.
- **Encryption at Rest**: wallet private keys are encrypted before persistence.

---

## 10) AI-Agent Friendly Component Map (Quick Reference)

| Component | Primary Input | Primary Output | Critical Side Effects |
|---|---|---|---|
| TransactionWatcherService | QuickNode webhook tx payload | internal `buy` event | dedup cache updates, watched token refresh |
| SellOrchestratorService | buy event | queued execution jobs | Redis lock lifecycle |
| SellExecutorService | orderId + trigger event + sell% | confirmed sell result | on-chain transfers/swaps, DB state transitions |
| MarketCapMonitorService | market-cap samples + order set | status/watch updates | QuickNode KV diff patch, stream pause/resume |
| EphemeralRecoveryWorker | stale ephemeral wallet set | recovery outcome | token/SOL sweep, wallet terminal status |
| NotificationService | domain event + payload | signed callback request | Redis idempotency keys |

---

## 11) Final Architectural Summary

Smart Profit Service is a **modular, event-driven, fault-tolerant sell automation platform** built around six runtime services:
- ingestion (`TransactionWatcherService`),
- decisioning (`SellOrchestratorService`),
- execution (`SellExecutorService`),
- lifecycle governance (`MarketCapMonitorService`),
- fund safety (`EphemeralRecoveryWorker`),
- and external event delivery (`NotificationService`).

The architecture prioritizes:
- deterministic orchestration,
- concurrency safety,
- external dependency isolation,
- recoverability of partial on-chain operations,
- and secure handling of private key material.

# Beru Bot — Shadow Sell

Beru Bot is a Telegram bot that runs the **Shadow Sell** feature: each user attaches the bot to a token mint they hold, and the bot automatically sells a slice of that holding whenever a qualifying buy lands on a configured DEX. The bot is built around a few domain concepts that recur across the codebase, the docs, and the operational tooling.

## Language

**Shadow Sell**:
The bot feature itself — automatic, configurable selling of a held SPL token whenever buys above user-set thresholds hit the on-chain pool.
_Avoid_: smart sell, auto-sell, sniper.

**Buy Detector**:
The subsystem that observes on-chain swaps against the configured DEX programs and emits a sell job whenever a watched mint is touched. Owns the watched-mint cache, the WebSocket subscriptions, and the degraded polling fallback.
_Avoid_: stream handler, webhook handler, listener.

**Watched Mint**:
An SPL token mint currently being monitored by an active Project Feature (i.e. a feature row with `is_watching = true`). The set of Watched Mints is the filter the Buy Detector applies to incoming log notifications.
_Avoid_: tracked token, watched token, mint.

**Project Feature**:
A single user's configuration of Shadow Sell for one token mint — thresholds (min/max sell %, min MCAP, min buy SOL), whitelist, status (idle / watching / executing / stopped). The unit that transitions between watching and not-watching.
_Avoid_: feature config, project config, watcher.

**DEX Program**:
A Solana on-chain program against which buys are detected. MVP scope: Pump.fun bonding curve, PumpSwap AMM, Raydium AMM v4. Each DEX Program has its own log layout and gets its own parser.
_Avoid_: protocol, AMM, exchange.

**Sell Window**:
The brief post-buy interval in which mirror-selling can ride the price impact of the triggering buy. Detection latency directly compresses this window — every extra second is price erosion.
_Avoid_: trade window, opportunity, edge.

**Ephemeral Wallet**:
A throwaway Solana keypair generated per sell execution. Receives the tokens + SOL gas via a combined funding TX, performs the Jupiter swap, then sweeps proceeds back to the user's main wallet. Isolates each sell from the main key.
_Avoid_: temp wallet, throwaway, hot wallet.

## Relationships

- A **User** owns up to 3 **Project Features** (one per token mint, enforced as `MAX_PROJECTS_PER_USER`).
- A **Project Feature** has exactly one **Watched Mint** while `is_watching = true`.
- The **Buy Detector** holds zero or more **Watched Mints** in its in-memory cache and N **DEX Program** WebSocket subscriptions (N = 3 for MVP).
- A buy on a **DEX Program** that touches a **Watched Mint** produces exactly one sell job (deduped by tx signature).
- Each sell job spawns exactly one **Ephemeral Wallet** that lives for the duration of one sell execution.

## Flagged ambiguities

- "watched token" / "tracked mint" / "monitored token" — all resolved as **Watched Mint**.
- "stream handler" (legacy QuickNode Streams term) — replaced by **Buy Detector**.
- "project" vs "project feature": a Project is the wrapper row (token + wallet + soft-delete); a **Project Feature** is the configured-and-stateful Shadow Sell behavior on that Project. Most of the bot's logic operates on Project Features.

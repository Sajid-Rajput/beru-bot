---
status: proposed
date: 2026-05-17
---

# Replace QuickNode Streams with self-hosted `logsSubscribe` for buy detection

QuickNode Streams was the original buy-detection mechanism in ARCHITECTURE.md v2 — a paid managed service that pushed HMAC-signed, pre-filtered transactions to a Hono route. We are replacing it with a self-hosted **Buy Detector** that opens one `logsSubscribe` WebSocket subscription per DEX Program (Pump.fun bonding curve, PumpSwap AMM, Raydium AMM v4) on a free-tier Solana RPC and filters by the in-memory Watched Mint set client-side. The user has cancelled their QuickNode subscription and the Stream product is too expensive at MVP stage; the new design runs on Chainstack Developer's free tier (3M RU/mo, 25 RPS, WSS included with no per-MB metering) with Helius free as hot fallback and `api.mainnet-beta.solana.com` as last-resort polling.

## Consequences

- **We now own reconnect logic, gap backfill, and the watched-mint cache.** A 30-second log-silence heartbeat flips the Buy Detector into degraded mode (poll `getSignaturesForAddress` per Watched Mint); reconnect folds back to primary with one reconcile poll, and Redis `SET NX dedup:{sig}` absorbs cross-mode overlap.
- **QuickNode KV is deleted.** The Watched Mint set lives in an in-memory `Map<mint, FeatureConfig[]>` on the worker process, sourced from `project_features.is_watching = true`, mutated reactively via Redis pub/sub (`watch:add` / `watch:remove`), and reconciled every 60 s by a full DB rescan.
- **HMAC webhook verification disappears for QN.** `src/server/middlewares/hmac-verify.ts` and `src/server/routes/quicknode.ts` are deleted. Telegram HMAC remains.
- **Ingestion moves from `app` to `worker` process.** Bot uptime is decoupled from RPC health; WS reconnect storms no longer affect Telegram message handling.
- **Detection latency target: <3 s p95** (was: sub-second via paid Streams). The Sell Window narrows slightly; acceptable for MVP.
- **`MarketCapMonitorWorker` loses its KV-sync and stream-pause/resume responsibilities** and reduces to: poll DexScreener, evaluate min-MCAP thresholds, publish `watch:add`/`watch:remove`.

## Considered options

- **`blockSubscribe` (full blocks)** — rejected: heaviest bandwidth on Solana mainnet, gated on most free tiers.
- **`getBlock` polling per slot** — rejected: burns RPS budget, latency ≥ 1 slot, gaps under load.
- **`getSignaturesForAddress` polling per Watched Mint as primary** — rejected: multi-second latency, doesn't scale past dozens of mints; kept only as the degraded fallback.
- **Helius free tier as primary** — rejected: as of 2026-05-01 Helius meters WSS at 20 credits/MB, which burns the 1M-credit monthly budget on busy Pump.fun days. Helius is the **hot fallback** instead.
- **Two-provider hot failover (Chainstack + Helius parallel WS)** — rejected for MVP: doubles operational complexity for a marginal latency gain; revisit at first paid tier.

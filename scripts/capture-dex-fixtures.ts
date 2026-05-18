/**
 * One-shot capture of {logsNotification, getParsedTransaction} pairs for a
 * single Solana program. Output feeds golden-file tests for DEX parsers
 * (`src/buy-detector/parsers/__tests__/fixtures/...`). Run once per DEX:
 *
 *   PROGRAM=6EF8rrec... OUT=tmp/raw-pump-fun-bc TARGET=30 \
 *     pnpm tsx scripts/capture-dex-fixtures.ts
 *
 * Or pull specific signatures (e.g. to backfill the `unknown` / `graduate`
 * categories that don't show up often on the subscription stream):
 *
 *   SIGS=sig1,sig2 OUT=tmp/raw-pump-fun-bc \
 *     pnpm tsx scripts/capture-dex-fixtures.ts
 *
 * Endpoint defaults to public mainnet-beta. Override with HTTP/WS env vars.
 * Public mainnet-beta is rate-limited; capture in small batches.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

import { Connection, PublicKey } from '@solana/web3.js'

const HTTP_URL = process.env.HTTP_URL ?? 'https://api.mainnet-beta.solana.com'
const WS_URL = process.env.WS_URL ?? HTTP_URL.replace(/^https/, 'wss').replace(/^http/, 'ws')
const PROGRAM = process.env.PROGRAM ?? '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'
const OUT = process.env.OUT ?? 'tmp/raw-fixtures'
const TARGET = Number.parseInt(process.env.TARGET ?? '30', 10)
const SIGS = (process.env.SIGS ?? '').split(',').map(s => s.trim()).filter(Boolean)

mkdirSync(OUT, { recursive: true })

const connection = new Connection(HTTP_URL, {
  wsEndpoint: WS_URL,
  commitment: 'confirmed',
})

interface CapturedFixture {
  source: 'subscribe' | 'by-signature'
  capturedAt: string
  logs: {
    signature: string
    err: unknown
    logs: string[] | null
  }
  slot: number | null
  tx: unknown
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, ms))
}

async function fetchAndSave(signature: string, slot: number | null, source: CapturedFixture['source'], logs: { err: unknown, logs: string[] | null } | null, index: number): Promise<void> {
  // Public mainnet-beta rate-limits + the index can lag the WS by a beat.
  // Retry a couple of times before giving up.
  let tx = null
  for (let attempt = 0; attempt < 4 && !tx; attempt++) {
    if (attempt > 0)
      await sleep(800 * attempt)
    tx = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    }).catch(() => null)
  }

  if (!tx) {
    console.warn(`  [${index}] tx not yet finalized for ${signature.slice(0, 12)} — skipping`)
    return
  }

  const payload: CapturedFixture = {
    source,
    capturedAt: new Date().toISOString(),
    logs: {
      signature,
      err: logs?.err ?? tx.meta?.err ?? null,
      logs: logs?.logs ?? tx.meta?.logMessages ?? null,
    },
    slot: slot ?? tx.slot,
    tx,
  }

  const fileName = `${String(index).padStart(3, '0')}-${signature.slice(0, 12)}.json`
  const filePath = join(OUT, fileName)
  writeFileSync(filePath, JSON.stringify(payload, null, 2))
  console.log(`  [${index}] saved ${fileName} (err=${payload.logs.err !== null})`)
}

async function captureBySignatures(): Promise<void> {
  console.log(`Fetching ${SIGS.length} signature(s) directly via getParsedTransaction`)
  let i = 0
  for (const sig of SIGS) {
    i += 1
    try {
      await fetchAndSave(sig, null, 'by-signature', null, i)
    }
    catch (err) {
      console.error(`  [${i}] ${sig}: ${(err as Error).message}`)
    }
  }
  process.exit(0)
}

async function captureBySubscription(): Promise<void> {
  console.log(`Subscribing to ${PROGRAM} on ${WS_URL}; target=${TARGET}; out=${OUT}`)
  let queued = 0
  let saved = 0
  let subId = 0
  const programKey = new PublicKey(PROGRAM)
  const seen = new Set<string>()
  const pending: Array<{ signature: string, slot: number, logs: { err: unknown, logs: string[] | null } }> = []
  let processing = false

  async function drain(): Promise<void> {
    if (processing)
      return
    processing = true
    while (pending.length > 0 && saved < TARGET) {
      const item = pending.shift()!
      saved += 1
      const i = saved
      try {
        await fetchAndSave(item.signature, item.slot, 'subscribe', item.logs, i)
      }
      catch (err) {
        console.error(`  [${i}] ${item.signature}: ${(err as Error).message}`)
      }
      // Be polite to the RPC's parsed-tx rate limit.
      await sleep(150)
    }
    processing = false
    if (saved >= TARGET) {
      await connection.removeOnLogsListener(subId)
      console.log('Done.')
      process.exit(0)
    }
  }

  subId = await connection.onLogs(
    programKey,
    (logs, ctx) => {
      if (queued >= TARGET || seen.has(logs.signature))
        return
      seen.add(logs.signature)
      queued += 1
      pending.push({ signature: logs.signature, slot: ctx.slot, logs: { err: logs.err, logs: logs.logs } })
      void drain()
    },
    'confirmed',
  )

  setTimeout(() => {
    console.warn(`Timed out waiting for ${TARGET} payloads; saved=${saved}`)
    process.exit(1)
  }, 5 * 60 * 1000)
}

// Both branches own their lifecycle — captureBySignatures exits on
// completion, captureBySubscription's setTimeout / drain() exit paths
// keep the event loop alive. `void` lets the top-level not await
// `Promise<never>`-typed handles.
if (SIGS.length > 0)
  void captureBySignatures()
else
  void captureBySubscription()

import { config } from '#root/config.js'
import { drizzle } from 'drizzle-orm/postgres-js'

import postgres from 'postgres'
import * as schema from './schema/index.js'

// ── Connection pool ────────────────────────────────────────────────────────
// postgres.js manages a pool internally; max: 10 is safe for a single-process bot.
// In the worker process this module is imported separately → each process gets
// its own pool (total 2 × 10 = 20 connections, well within PG default of 100).
//
// NOTE: Connection is established eagerly on module import.  For test isolation
// prefer the `createDb()` factory exported below.
const queryClient = postgres(config.databaseUrl, {
  max: 10,
  idle_timeout: 30, // release idle connections after 30 s
  connect_timeout: 10, // fail fast on unreachable host
  onnotice: () => {}, // suppress NOTICE messages from migrations
})

// ── Drizzle client (with full schema for relational queries) ───────────────
export const db = drizzle(queryClient, { schema })

// ── Graceful shutdown helper ───────────────────────────────────────────────
// Call this in SIGTERM/SIGINT handlers so in-flight queries can complete
// before the process exits.
export async function closeDb(): Promise<void> {
  await queryClient.end()
}

// ── Test isolation factory ─────────────────────────────────────────────────
// Returns a fresh Drizzle client + cleanup function.
// Useful in integration tests to avoid shared module-level state.
export function createDb(url: string) {
  const client = postgres(url, { max: 2 })
  const database = drizzle(client, { schema })
  return { db: database, close: () => client.end() }
}

// Re-export schema so callers can do: import { db, users } from '#root/db/index.js'
export * from './schema/index.js'

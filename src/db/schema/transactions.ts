import type { SellJobData } from '#root/queue/types.js'
import { sql } from 'drizzle-orm'
import { decimal, index, integer, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { featureTypeEnum, transactionStatusEnum } from './enums.js'
import { projectFeatures } from './project-features.js'

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectFeatureId: uuid('project_feature_id').notNull().references(() => projectFeatures.id),
  type: featureTypeEnum('type').notNull(),

  // On-chain signatures — one per step of the Sell Execution attempt.
  // See ADR-0002 §3: transactions is the single source of truth.
  triggerTxSignature: varchar('trigger_tx_signature', { length: 128 }),
  fundingTxSignature: varchar('funding_tx_signature', { length: 128 }),
  sellTxSignature: varchar('sell_tx_signature', { length: 128 }),
  sweepTxSignature: varchar('sweep_tx_signature', { length: 128 }),

  tokenAmountSold: decimal('token_amount_sold', { precision: 20, scale: 9 }),
  solAmountReceived: decimal('sol_amount_received', { precision: 20, scale: 9 }),
  sellPercentage: decimal('sell_percentage', { precision: 5, scale: 2 }),

  status: transactionStatusEnum('status').notNull().default('pending'),
  errorDetails: jsonb('error_details'),

  // Recovery support (ADR-0002 §4 / #41). The full SellJob payload is persisted
  // at row creation so the recovery scanner can re-enqueue it without re-reading
  // the WatchedFeatureCache (whose state may have drifted since the match).
  jobSnapshot: jsonb('job_snapshot').$type<SellJobData>(),
  // How many times the recovery scanner has re-enqueued this attempt. After
  // MAX_RECOVERY_ATTEMPTS the row is marked terminally failed.
  recoveryAttempts: integer('recovery_attempts').notNull().default(0),
  // Bumped by the Sell Execution worker on every step transition; the recovery
  // scanner only considers rows whose last attempt is older than the cooldown.
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, table => ({
  statusIdx: index('idx_transactions_status')
    .on(table.status)
    .where(sql`${table.status} NOT IN ('completed', 'failed')`),
  recoveryIdx: index('idx_transactions_recovery')
    .on(table.status)
    .where(sql`${table.status} = 'recovery_needed'`),
}))

import { sql } from 'drizzle-orm'
import { decimal, index, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
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

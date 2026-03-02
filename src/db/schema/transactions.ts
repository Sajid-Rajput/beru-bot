import { sql } from 'drizzle-orm'
import { decimal, index, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { featureTypeEnum, transactionStatusEnum } from './enums.js'
import { projectFeatures } from './project-features.js'

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectFeatureId: uuid('project_feature_id').notNull().references(() => projectFeatures.id),
  type: featureTypeEnum('type').notNull(),

  // Trigger
  triggerTxSignature: varchar('trigger_tx_signature', { length: 128 }),

  // Sell result
  sellTxSignature: varchar('sell_tx_signature', { length: 128 }),
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
}))

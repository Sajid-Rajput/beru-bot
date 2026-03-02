import { sql } from 'drizzle-orm'
import { decimal, index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { feeCollectionStatusEnum } from './enums.js'
import { transactions } from './transactions.js'
import { users } from './users.js'

export const feeLedger = pgTable('fee_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  transactionId: uuid('transaction_id').notNull().unique().references(() => transactions.id),
  userId: uuid('user_id').notNull().references(() => users.id),

  grossSol: decimal('gross_sol', { precision: 20, scale: 9 }).notNull(),
  grossFee: decimal('gross_fee', { precision: 20, scale: 9 }).notNull(),
  referralDiscount: decimal('referral_discount', { precision: 20, scale: 9 }).notNull().default('0'),
  effectiveFee: decimal('effective_fee', { precision: 20, scale: 9 }).notNull(),

  tier1ReferrerShare: decimal('tier1_referrer_share', { precision: 20, scale: 9 }).notNull().default('0'),
  tier1ReferrerId: uuid('tier1_referrer_id').references(() => users.id),
  tier2ReferrerShare: decimal('tier2_referrer_share', { precision: 20, scale: 9 }).notNull().default('0'),
  tier2ReferrerId: uuid('tier2_referrer_id').references(() => users.id),

  platformNet: decimal('platform_net', { precision: 20, scale: 9 }).notNull(),
  collectionStatus: feeCollectionStatusEnum('collection_status').notNull().default('pending'),
  feeTxSignature: varchar('fee_tx_signature', { length: 128 }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  pendingIdx: index('idx_fee_ledger_pending')
    .on(table.collectionStatus)
    .where(sql`${table.collectionStatus} = 'pending'`),
}))

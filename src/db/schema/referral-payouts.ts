import { decimal, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { payoutStatusEnum } from './enums.js'
import { users } from './users.js'

export const referralPayouts = pgTable('referral_payouts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  amountSol: decimal('amount_sol', { precision: 20, scale: 9 }).notNull(),
  payoutTxSignature: varchar('payout_tx_signature', { length: 128 }),
  status: payoutStatusEnum('status').notNull().default('pending'),
  earnedSinceLastPayout: decimal('earned_since_last_payout', { precision: 20, scale: 9 }).notNull().default('0'),
  periodStart: timestamp('period_start', { withTimezone: true }),
  periodEnd: timestamp('period_end', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

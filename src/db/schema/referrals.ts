import { integer, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { users } from './users.js'

export const referrals = pgTable('referrals', {
  id: uuid('id').primaryKey().defaultRandom(),
  referrerId: uuid('referrer_id').notNull().references(() => users.id),
  referredId: uuid('referred_id').notNull().references(() => users.id),
  tier: integer('tier').notNull(), // 1 = direct, 2 = indirect

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  uniqueReferral: uniqueIndex('idx_referrals_unique').on(table.referrerId, table.referredId),
}))

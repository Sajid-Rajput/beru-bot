import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { bigint, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { referralTierEnum } from './enums.js'

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  telegramId: bigint('telegram_id', { mode: 'number' }).notNull().unique(),
  username: varchar('username', { length: 255 }),
  firstName: varchar('first_name', { length: 255 }),
  referralCode: varchar('referral_code', { length: 32 }).notNull().unique(),
  referredByUserId: uuid('referred_by_user_id').references((): AnyPgColumn => users.id),
  payoutWalletAddress: varchar('payout_wallet_address', { length: 64 }),

  // Community strategy: referral tier + time-limited fee discount
  referralTier: referralTierEnum('referral_tier').notNull().default('none'),
  feeDiscountExpiresAt: timestamp('fee_discount_expires_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

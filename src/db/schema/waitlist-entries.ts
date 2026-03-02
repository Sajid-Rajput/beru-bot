import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { bigint, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { waitlistStatusEnum } from './enums.js'

export const waitlistEntries = pgTable('waitlist_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  telegramId: bigint('telegram_id', { mode: 'number' }).notNull().unique(),
  username: text('username'),
  firstName: text('first_name'),
  position: integer('position').notNull(),
  referredBy: bigint('referred_by', { mode: 'number' }).references((): AnyPgColumn => waitlistEntries.telegramId),
  referralCount: integer('referral_count').notNull().default(0),
  source: text('source').notNull().default('organic'),
  status: waitlistStatusEnum('status').notNull().default('waiting'),

  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  notifiedAt: timestamp('notified_at', { withTimezone: true }),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  positionIdx: index('idx_waitlist_position').on(table.position),
  referredByIdx: index('idx_waitlist_referred_by').on(table.referredBy),
  statusIdx: index('idx_waitlist_status').on(table.status),
  sourceIdx: index('idx_waitlist_source').on(table.source),
}))

import { index, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { users } from './users.js'

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  eventType: varchar('event_type', { length: 64 }).notNull(),
  eventData: jsonb('event_data').notNull().default({}),
  ipAddress: varchar('ip_address', { length: 45 }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  userTimeIdx: index('idx_audit_log_user_time').on(table.userId, table.createdAt),
}))

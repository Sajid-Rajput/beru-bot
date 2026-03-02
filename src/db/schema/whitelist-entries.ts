import { pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { projectFeatures } from './project-features.js'

export const whitelistEntries = pgTable('whitelist_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectFeatureId: uuid('project_feature_id').notNull().references(() => projectFeatures.id),
  walletAddress: varchar('wallet_address', { length: 64 }).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  uniqueEntry: uniqueIndex('idx_whitelist_unique').on(table.projectFeatureId, table.walletAddress),
}))

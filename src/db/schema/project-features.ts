import { sql } from 'drizzle-orm'
import { boolean, decimal, index, integer, jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import { featureStatusEnum, featureTypeEnum } from './enums.js'
import { projects } from './projects.js'

export const projectFeatures = pgTable('project_features', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  featureType: featureTypeEnum('feature_type').notNull(),
  status: featureStatusEnum('status').notNull().default('idle'),

  // Feature-specific config stored as JSONB
  // Each feature type defines its own config shape (see ShadowSellConfig, etc.)
  config: jsonb('config').notNull().default({}),

  isWatchingTransactions: boolean('is_watching_transactions').notNull().default(false),
  pinnedMessageId: integer('pinned_message_id'),
  lastMarketCapUsd: decimal('last_market_cap_usd', { precision: 20, scale: 2 }),
  totalSoldAmount: decimal('total_sold_amount', { precision: 20, scale: 9 }).notNull().default('0'),
  totalSolReceived: decimal('total_sol_received', { precision: 20, scale: 9 }).notNull().default('0'),
  totalSellCount: integer('total_sell_count').notNull().default(0),

  startedAt: timestamp('started_at', { withTimezone: true }),
  stoppedAt: timestamp('stopped_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  statusIdx: index('idx_project_features_status')
    .on(table.status)
    .where(sql`${table.status} IN ('pending', 'watching', 'executing')`),
  watchingIdx: index('idx_project_features_watching')
    .on(table.isWatchingTransactions)
    .where(sql`${table.isWatchingTransactions} = true`),
}))

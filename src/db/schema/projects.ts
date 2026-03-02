import { sql } from 'drizzle-orm'
import { pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { users } from './users.js'
import { wallets } from './wallets.js'

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  walletId: uuid('wallet_id').notNull().references(() => wallets.id),
  tokenMint: varchar('token_mint', { length: 64 }).notNull(),
  tokenName: varchar('token_name', { length: 255 }),
  tokenSymbol: varchar('token_symbol', { length: 32 }),
  tokenDecimals: varchar('token_decimals', { length: 4 }),
  dexUrl: varchar('dex_url', { length: 512 }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, table => ({
  uniqueUserToken: uniqueIndex('idx_projects_user_token')
    .on(table.userId, table.tokenMint)
    .where(sql`${table.deletedAt} IS NULL`),
}))

import { index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { walletSourceEnum } from './enums.js'
import { users } from './users.js'

export const wallets = pgTable('wallets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  publicKey: varchar('public_key', { length: 64 }).notNull().unique(),

  // Layer 2: private key encrypted by DEK (AES-256-GCM)
  encryptedPrivateKey: text('encrypted_private_key').notNull(),
  pkIv: varchar('pk_iv', { length: 64 }).notNull(),
  pkAuthTag: varchar('pk_auth_tag', { length: 64 }).notNull(),

  // Layer 1: DEK encrypted by MEK (AES-256-GCM)
  dekEncrypted: text('dek_encrypted').notNull(),
  dekIv: varchar('dek_iv', { length: 64 }).notNull(),
  dekAuthTag: varchar('dek_auth_tag', { length: 64 }).notNull(),
  dekSalt: varchar('dek_salt', { length: 64 }).notNull(),

  source: walletSourceEnum('source').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  userIdx: index('idx_wallets_user_id').on(table.userId),
}))

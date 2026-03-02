import { sql } from 'drizzle-orm'
import { index, integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { ephemeralStatusEnum } from './enums.js'
import { transactions } from './transactions.js'

export const ephemeralWallets = pgTable('ephemeral_wallets', {
  id: uuid('id').primaryKey().defaultRandom(),
  transactionId: uuid('transaction_id').notNull().references(() => transactions.id),
  publicKey: varchar('public_key', { length: 64 }).notNull(),

  // Layer 2: private key encrypted by DEK (AES-256-GCM)
  encryptedPrivateKey: text('encrypted_private_key').notNull(),
  pkIv: varchar('pk_iv', { length: 64 }).notNull(),
  pkAuthTag: varchar('pk_auth_tag', { length: 64 }).notNull(),

  // Layer 1: DEK encrypted by MEK (AES-256-GCM)
  dekEncrypted: text('dek_encrypted').notNull(),
  dekIv: varchar('dek_iv', { length: 64 }).notNull(),
  dekAuthTag: varchar('dek_auth_tag', { length: 64 }).notNull(),
  dekSalt: varchar('dek_salt', { length: 64 }).notNull(),

  tokenMint: varchar('token_mint', { length: 64 }).notNull(),
  mainWalletPublicKey: varchar('main_wallet_public_key', { length: 64 }).notNull(),

  status: ephemeralStatusEnum('status').notNull().default('created'),
  recoveryAttempts: integer('recovery_attempts').notNull().default(0),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  recoveryIdx: index('idx_ephemeral_wallets_recovery')
    .on(table.status)
    .where(sql`${table.status} = 'recovery_needed'`),
}))

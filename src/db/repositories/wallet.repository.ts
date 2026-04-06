import { db } from '#root/db/index.js'

import { wallets } from '#root/db/schema/index.js'
import { eq } from 'drizzle-orm'

export type WalletRecord = typeof wallets.$inferSelect
export type NewWallet = typeof wallets.$inferInsert

export class WalletRepository {
  async create(data: NewWallet): Promise<WalletRecord> {
    const [wallet] = await db.insert(wallets).values(data).returning()
    return wallet!
  }

  async findById(id: string): Promise<WalletRecord | undefined> {
    return db.query.wallets.findFirst({ where: eq(wallets.id, id) })
  }

  async findByPublicKey(publicKey: string): Promise<WalletRecord | undefined> {
    return db.query.wallets.findFirst({ where: eq(wallets.publicKey, publicKey) })
  }

  async findByUserId(userId: string): Promise<WalletRecord[]> {
    return db.query.wallets.findMany({ where: eq(wallets.userId, userId) })
  }
}

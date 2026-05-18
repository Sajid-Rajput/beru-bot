import { db } from '#root/db/index.js'

import { ephemeralWallets } from '#root/db/schema/index.js'
import { eq } from 'drizzle-orm'

export type EphemeralWalletRecord = typeof ephemeralWallets.$inferSelect
export type NewEphemeralWallet = typeof ephemeralWallets.$inferInsert

export class EphemeralWalletRepository {
  async create(data: NewEphemeralWallet): Promise<EphemeralWalletRecord> {
    const [wallet] = await db.insert(ephemeralWallets).values(data).returning()
    return wallet!
  }

  async findById(id: string): Promise<EphemeralWalletRecord | undefined> {
    return db.query.ephemeralWallets.findFirst({ where: eq(ephemeralWallets.id, id) })
  }

  async findByTransactionId(transactionId: string): Promise<EphemeralWalletRecord | undefined> {
    return db.query.ephemeralWallets.findFirst({
      where: eq(ephemeralWallets.transactionId, transactionId),
    })
  }
}

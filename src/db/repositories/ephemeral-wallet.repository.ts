import { db } from '#root/db/index.js'

import { ephemeralWallets } from '#root/db/schema/index.js'
import { eq, sql } from 'drizzle-orm'

export type EphemeralWalletRecord = typeof ephemeralWallets.$inferSelect
export type NewEphemeralWallet = typeof ephemeralWallets.$inferInsert
export type EphemeralStatus = EphemeralWalletRecord['status']

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

  async updateStatus(id: string, status: EphemeralStatus): Promise<void> {
    await db
      .update(ephemeralWallets)
      .set({ status, updatedAt: new Date() })
      .where(eq(ephemeralWallets.id, id))
  }

  /** Used by RecoveryWorker — fetches wallets needing sweep retry */
  async findRecoveryNeeded(): Promise<EphemeralWalletRecord[]> {
    return db.query.ephemeralWallets.findMany({
      where: eq(ephemeralWallets.status, 'recovery_needed'),
    })
  }

  async incrementRecoveryAttempts(id: string): Promise<number> {
    const [row] = await db
      .update(ephemeralWallets)
      .set({
        recoveryAttempts: sql`${ephemeralWallets.recoveryAttempts} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(ephemeralWallets.id, id))
      .returning({ attempts: ephemeralWallets.recoveryAttempts })
    return row?.attempts ?? 0
  }
}

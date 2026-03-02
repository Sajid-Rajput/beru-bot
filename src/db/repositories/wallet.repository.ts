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

  /**
   * Set or clear wallet assignment.
   * @param id         Wallet UUID
   * @param assigned   true → assign, false → unassign
   * @param projectId  UUID when assigning, null when unassigning
   */
  async setAssigned(
    id: string,
    assigned: boolean,
    projectId: string | null,
  ): Promise<void> {
    await db
      .update(wallets)
      .set({
        isAssigned: assigned,
        assignedProjectId: projectId,
      })
      .where(eq(wallets.id, id))
  }
}

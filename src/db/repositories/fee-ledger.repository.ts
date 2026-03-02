import { eq } from 'drizzle-orm'

import { db } from '#root/db/index.js'
import { feeLedger } from '#root/db/schema/index.js'

export type FeeLedgerRecord = typeof feeLedger.$inferSelect
export type NewFeeLedger = typeof feeLedger.$inferInsert

export class FeeLedgerRepository {
  async create(data: NewFeeLedger): Promise<FeeLedgerRecord> {
    const [entry] = await db.insert(feeLedger).values(data).returning()
    return entry!
  }

  async findByTransactionId(transactionId: string): Promise<FeeLedgerRecord | undefined> {
    return db.query.feeLedger.findFirst({
      where: eq(feeLedger.transactionId, transactionId),
    })
  }

  /** All pending fee collections — used by FeePayoutWorker */
  async findPendingPayouts(userId: string): Promise<FeeLedgerRecord[]> {
    return db.query.feeLedger.findMany({
      where: eq(feeLedger.userId, userId),
    })
  }

  async updateCollectionStatus(
    id: string,
    status: FeeLedgerRecord['collectionStatus'],
    feeTxSignature?: string,
  ): Promise<void> {
    await db
      .update(feeLedger)
      .set({ collectionStatus: status, ...(feeTxSignature ? { feeTxSignature } : {}) })
      .where(eq(feeLedger.id, id))
  }
}

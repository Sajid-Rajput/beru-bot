import { and, eq, notInArray } from 'drizzle-orm'

import { db } from '#root/db/index.js'
import { transactions } from '#root/db/schema/index.js'

export type TransactionRecord = typeof transactions.$inferSelect
export type NewTransaction = typeof transactions.$inferInsert
export type TransactionStatus = TransactionRecord['status']

const TERMINAL_STATUSES: TransactionStatus[] = ['completed', 'failed']

export class TransactionRepository {
  async create(data: NewTransaction): Promise<TransactionRecord> {
    const [tx] = await db.insert(transactions).values(data).returning()
    return tx!
  }

  async findById(id: string): Promise<TransactionRecord | undefined> {
    return db.query.transactions.findFirst({ where: eq(transactions.id, id) })
  }

  async updateStatus(
    id: string,
    status: TransactionStatus,
    extra?: { sellTxSignature?: string, completedAt?: Date, errorDetails?: unknown },
  ): Promise<void> {
    await db
      .update(transactions)
      .set({ status, ...extra })
      .where(eq(transactions.id, id))
  }

  /** Pending (non-terminal) transactions for a feature — used by recovery worker */
  async findPendingByFeatureId(projectFeatureId: string): Promise<TransactionRecord[]> {
    return db.query.transactions.findMany({
      where: and(
        eq(transactions.projectFeatureId, projectFeatureId),
        notInArray(transactions.status, TERMINAL_STATUSES),
      ),
    })
  }
}

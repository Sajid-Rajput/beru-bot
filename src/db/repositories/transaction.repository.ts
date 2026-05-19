import type { NewFeeLedger } from '#root/db/repositories/fee-ledger.repository.js'
import { db } from '#root/db/index.js'

import { feeLedger, transactions } from '#root/db/schema/index.js'
import { and, eq, notInArray } from 'drizzle-orm'

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

  async findByFeatureAndTrigger(
    projectFeatureId: string,
    triggerTxSignature: string,
  ): Promise<TransactionRecord | undefined> {
    return db.query.transactions.findFirst({
      where: and(
        eq(transactions.projectFeatureId, projectFeatureId),
        eq(transactions.triggerTxSignature, triggerTxSignature),
      ),
    })
  }

  async markFunded(id: string, fundingTxSignature: string): Promise<void> {
    await db
      .update(transactions)
      .set({ fundingTxSignature, status: 'funding' })
      .where(eq(transactions.id, id))
  }

  async markSwapped(id: string, sellTxSignature: string, solAmountReceived: string): Promise<void> {
    await db
      .update(transactions)
      .set({ sellTxSignature, solAmountReceived, status: 'swapping' })
      .where(eq(transactions.id, id))
  }

  /**
   * Atomically writes the sweep signature + completed status on `transactions`
   * AND inserts the fee_ledger row in a single Postgres transaction.
   * Per ADR-0002 decision 5.
   */
  async markCompletedWithFee(input: {
    transactionId: string
    sweepTxSignature: string
    fee: NewFeeLedger
  }): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .update(transactions)
        .set({
          sweepTxSignature: input.sweepTxSignature,
          status: 'completed',
          completedAt: new Date(),
        })
        .where(eq(transactions.id, input.transactionId))
      await tx.insert(feeLedger).values(input.fee)
    })
  }

  async markFailed(id: string, errorDetails: unknown): Promise<void> {
    await db
      .update(transactions)
      .set({ status: 'failed', errorDetails, completedAt: new Date() })
      .where(eq(transactions.id, id))
  }

  async markRecoveryNeeded(id: string, errorDetails: unknown): Promise<void> {
    await db
      .update(transactions)
      .set({ status: 'recovery_needed', errorDetails })
      .where(eq(transactions.id, id))
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

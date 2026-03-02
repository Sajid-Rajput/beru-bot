import { db } from '#root/db/index.js'

import { waitlistEntries } from '#root/db/schema/index.js'
import { eq, sql } from 'drizzle-orm'

export type WaitlistRecord = typeof waitlistEntries.$inferSelect
export type NewWaitlistEntry = typeof waitlistEntries.$inferInsert

export class WaitlistRepository {
  /**
   * Join the waitlist. Position is assigned as (current max + 1) atomically.
   * Returns the new entry.
   */
  async join(data: Omit<NewWaitlistEntry, 'position'>): Promise<WaitlistRecord> {
    // Assign position atomically with a subquery
    const [entry] = await db
      .insert(waitlistEntries)
      .values({
        ...data,
        position: sql<number>`(
          SELECT COALESCE(MAX(${waitlistEntries.position}), 0) + 1
          FROM ${waitlistEntries}
        )`,
      })
      .returning()
    return entry!
  }

  async findByTelegramId(telegramId: number): Promise<WaitlistRecord | undefined> {
    return db.query.waitlistEntries.findFirst({
      where: eq(waitlistEntries.telegramId, telegramId),
    })
  }

  async getCount(): Promise<number> {
    const [row] = await db
      .select({ value: sql<number>`COUNT(*)::int` })
      .from(waitlistEntries)
    return row?.value ?? 0
  }

  async findAllWaiting(): Promise<WaitlistRecord[]> {
    return db.query.waitlistEntries.findMany({
      where: eq(waitlistEntries.status, 'waiting'),
    })
  }

  async markNotified(id: string): Promise<void> {
    await db
      .update(waitlistEntries)
      .set({ status: 'notified', notifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(waitlistEntries.id, id))
  }

  /** Bump position up by 1 (min position is 1) for referral reward */
  async bumpPosition(telegramId: number): Promise<void> {
    await db
      .update(waitlistEntries)
      .set({
        position: sql`GREATEST(1, ${waitlistEntries.position} - 1)`,
        referralCount: sql`${waitlistEntries.referralCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(waitlistEntries.telegramId, telegramId))
  }
}

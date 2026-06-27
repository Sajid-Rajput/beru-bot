import { db as defaultDb } from '#root/db/index.js'

import { waitlistEntries } from '#root/db/schema/index.js'
import { eq, sql } from 'drizzle-orm'

export type WaitlistRecord = typeof waitlistEntries.$inferSelect
export type NewWaitlistEntry = typeof waitlistEntries.$inferInsert

/** Outcome of a {@link WaitlistRepository.join}. */
export interface WaitlistJoinOutcome {
  /** The joiner's row — freshly inserted, or the pre-existing one. */
  entry: WaitlistRecord
  /** The credited referrer's post-credit row, when one was credited. */
  referrer?: WaitlistRecord
  /** True when the joiner was already on the list (no row inserted, no credit). */
  alreadyJoined: boolean
}

export class WaitlistRepository {
  // `db` is injected so integration tests can point at a throwaway test
  // database via `createDb()`; production callers get the singleton pool.
  constructor(private readonly db = defaultDb) {}

  /**
   * Join the waitlist (issue #14 / strategy §7.5). All in one transaction:
   *   - if the member already exists, return them unchanged (idempotent);
   *   - otherwise insert at position MAX(position)+1;
   *   - when `referredByTelegramId` matches an existing member, credit them
   *     (position −1, floored at 1; referral_count +1) and return their row.
   *
   * The referrer is only linked/credited when they actually exist — the
   * `referred_by` FK points at `telegram_id`, so blindly storing an unknown id
   * would raise a foreign-key violation.
   */
  async join(
    data: Omit<NewWaitlistEntry, 'position'>,
    referredByTelegramId?: number,
  ): Promise<WaitlistJoinOutcome> {
    return this.db.transaction(async (tx) => {
      const existing = await tx.query.waitlistEntries.findFirst({
        where: eq(waitlistEntries.telegramId, data.telegramId),
      })
      if (existing)
        return { entry: existing, alreadyJoined: true }

      const credits = referredByTelegramId != null && referredByTelegramId !== data.telegramId
      const referrerExists = credits
        ? await tx.query.waitlistEntries.findFirst({
            where: eq(waitlistEntries.telegramId, referredByTelegramId),
          })
        : undefined

      const [entry] = await tx
        .insert(waitlistEntries)
        .values({
          ...data,
          referredBy: referrerExists ? referredByTelegramId : null,
          position: sql<number>`(
            SELECT COALESCE(MAX(${waitlistEntries.position}), 0) + 1
            FROM ${waitlistEntries}
          )`,
        })
        .returning()

      let referrer: WaitlistRecord | undefined
      if (referrerExists) {
        const [updated] = await tx
          .update(waitlistEntries)
          .set({
            position: sql`GREATEST(1, ${waitlistEntries.position} - 1)`,
            referralCount: sql`${waitlistEntries.referralCount} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(waitlistEntries.telegramId, referredByTelegramId!))
          .returning()
        referrer = updated
      }

      return { entry: entry!, referrer, alreadyJoined: false }
    })
  }

  async findByTelegramId(telegramId: number): Promise<WaitlistRecord | undefined> {
    return this.db.query.waitlistEntries.findFirst({
      where: eq(waitlistEntries.telegramId, telegramId),
    })
  }

  async getCount(): Promise<number> {
    const [row] = await this.db
      .select({ value: sql<number>`COUNT(*)::int` })
      .from(waitlistEntries)
    return row?.value ?? 0
  }

  async findAllWaiting(): Promise<WaitlistRecord[]> {
    return this.db.query.waitlistEntries.findMany({
      where: eq(waitlistEntries.status, 'waiting'),
    })
  }

  async markNotified(id: string): Promise<void> {
    await this.db
      .update(waitlistEntries)
      .set({ status: 'notified', notifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(waitlistEntries.id, id))
  }
}

import { db } from '#root/db/index.js'

import { feeLedger, referralPayouts, referrals } from '#root/db/schema/index.js'
import { and, eq, sql } from 'drizzle-orm'

export type ReferralRecord = typeof referrals.$inferSelect
export type NewReferral = typeof referrals.$inferInsert

export interface ReferralEarnings {
  totalEarned: string
  pendingPayout: string
}

export class ReferralRepository {
  async create(data: NewReferral): Promise<ReferralRecord> {
    const [referral] = await db.insert(referrals).values(data).returning()
    return referral!
  }

  /** The user who directly referred `referredId` (tier 1) */
  async findReferrer(referredId: string): Promise<ReferralRecord | undefined> {
    return db.query.referrals.findFirst({
      where: and(eq(referrals.referredId, referredId), eq(referrals.tier, 1)),
    })
  }

  /** All users referred by `referrerId` at a given tier */
  async findReferredUsers(referrerId: string, tier: 1 | 2): Promise<ReferralRecord[]> {
    return db.query.referrals.findMany({
      where: and(eq(referrals.referrerId, referrerId), eq(referrals.tier, tier)),
    })
  }

  /**
   * Earnings summary for a user: total tier1/tier2 shares from fee_ledger
   * minus already-paid referral_payouts.
   */
  async getEarnings(userId: string): Promise<ReferralEarnings> {
    // Sum of all referrer share credits in fee_ledger
    const [earned] = await db
      .select({
        total: sql<string>`
          COALESCE(SUM(
            CASE WHEN ${feeLedger.tier1ReferrerId} = ${userId} THEN ${feeLedger.tier1ReferrerShare}
                 WHEN ${feeLedger.tier2ReferrerId} = ${userId} THEN ${feeLedger.tier2ReferrerShare}
                 ELSE 0
            END
          ), '0')`,
      })
      .from(feeLedger)
    // Sum of confirmed payouts
    const [paid] = await db
      .select({ total: sql<string>`COALESCE(SUM(${referralPayouts.amountSol}), '0')` })
      .from(referralPayouts)
      .where(and(eq(referralPayouts.userId, userId), eq(referralPayouts.status, 'confirmed')))

    return {
      totalEarned: earned?.total ?? '0',
      pendingPayout: String(
        Math.max(0, Number(earned?.total ?? 0) - Number(paid?.total ?? 0)),
      ),
    }
  }
}

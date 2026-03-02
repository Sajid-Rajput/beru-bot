import { eq } from 'drizzle-orm'

import { db } from '#root/db/index.js'
import { users } from '#root/db/schema/index.js'

export type UserRecord = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

export class UserRepository {
  async findById(id: string): Promise<UserRecord | undefined> {
    return db.query.users.findFirst({ where: eq(users.id, id) })
  }

  async findByTelegramId(telegramId: number): Promise<UserRecord | undefined> {
    return db.query.users.findFirst({ where: eq(users.telegramId, telegramId) })
  }

  async findByReferralCode(referralCode: string): Promise<UserRecord | undefined> {
    return db.query.users.findFirst({ where: eq(users.referralCode, referralCode) })
  }

  async create(data: NewUser): Promise<UserRecord> {
    const [user] = await db.insert(users).values(data).returning()
    return user!
  }

  async updatePayoutWallet(id: string, address: string | null): Promise<void> {
    await db
      .update(users)
      .set({ payoutWalletAddress: address, updatedAt: new Date() })
      .where(eq(users.id, id))
  }

  async update(id: string, data: Partial<NewUser>): Promise<UserRecord> {
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning()
    return user!
  }
}

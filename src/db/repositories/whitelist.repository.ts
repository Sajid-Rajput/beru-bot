import { db } from '#root/db/index.js'

import { whitelistEntries } from '#root/db/schema/index.js'
import { and, count, eq } from 'drizzle-orm'

export type WhitelistRecord = typeof whitelistEntries.$inferSelect

export class WhitelistRepository {
  async create(projectFeatureId: string, walletAddress: string): Promise<WhitelistRecord> {
    const [entry] = await db
      .insert(whitelistEntries)
      .values({ projectFeatureId, walletAddress })
      .returning()
    return entry!
  }

  async findById(id: string): Promise<WhitelistRecord | undefined> {
    return db.query.whitelistEntries.findFirst({
      where: eq(whitelistEntries.id, id),
    })
  }

  async findByFeatureId(projectFeatureId: string): Promise<WhitelistRecord[]> {
    return db.query.whitelistEntries.findMany({
      where: eq(whitelistEntries.projectFeatureId, projectFeatureId),
    })
  }

  async delete(id: string): Promise<void> {
    await db.delete(whitelistEntries).where(eq(whitelistEntries.id, id))
  }

  async deleteByAddress(projectFeatureId: string, walletAddress: string): Promise<void> {
    await db
      .delete(whitelistEntries)
      .where(
        and(
          eq(whitelistEntries.projectFeatureId, projectFeatureId),
          eq(whitelistEntries.walletAddress, walletAddress),
        ),
      )
  }

  async countByFeatureId(projectFeatureId: string): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(whitelistEntries)
      .where(eq(whitelistEntries.projectFeatureId, projectFeatureId))
    return row?.value ?? 0
  }

  async isWhitelisted(projectFeatureId: string, walletAddress: string): Promise<boolean> {
    const entry = await db.query.whitelistEntries.findFirst({
      where: and(
        eq(whitelistEntries.projectFeatureId, projectFeatureId),
        eq(whitelistEntries.walletAddress, walletAddress),
      ),
    })
    return entry !== undefined
  }
}

import type { ShadowSellConfig } from '#root/db/schema/index.js'

import { db } from '#root/db/index.js'
import { projectFeatures, projects } from '#root/db/schema/index.js'
import { and, eq, isNull, sql } from 'drizzle-orm'

export type ProjectFeatureRecord = typeof projectFeatures.$inferSelect
export type NewProjectFeature = typeof projectFeatures.$inferInsert
export type FeatureStatus = ProjectFeatureRecord['status']

export class ProjectFeatureRepository {
  async create(data: NewProjectFeature): Promise<ProjectFeatureRecord> {
    const [feature] = await db.insert(projectFeatures).values(data).returning()
    return feature!
  }

  async findById(id: string): Promise<ProjectFeatureRecord | undefined> {
    return db.query.projectFeatures.findFirst({ where: eq(projectFeatures.id, id) })
  }

  /** Resolves the owning user_id for a feature via its parent project — used by sell-execution. */
  async findUserIdById(id: string): Promise<string | undefined> {
    const [row] = await db
      .select({ userId: projects.userId })
      .from(projectFeatures)
      .innerJoin(projects, eq(projectFeatures.projectId, projects.id))
      .where(eq(projectFeatures.id, id))
      .limit(1)
    return row?.userId
  }

  async findByProjectId(projectId: string): Promise<ProjectFeatureRecord | undefined> {
    return db.query.projectFeatures.findFirst({
      where: eq(projectFeatures.projectId, projectId),
    })
  }

  async updateStatus(id: string, status: FeatureStatus): Promise<void> {
    const now = new Date()
    await db
      .update(projectFeatures)
      .set({
        status,
        updatedAt: now,
        ...(status === 'watching' || status === 'executing' ? { startedAt: now } : {}),
        ...(status === 'stopped' || status === 'completed' ? { stoppedAt: now } : {}),
      })
      .where(eq(projectFeatures.id, id))
  }

  async updateConfig(id: string, config: ShadowSellConfig): Promise<void> {
    await db
      .update(projectFeatures)
      .set({ config, updatedAt: new Date() })
      .where(eq(projectFeatures.id, id))
  }

  async setWatching(id: string, watching: boolean): Promise<void> {
    await db
      .update(projectFeatures)
      .set({ isWatchingTransactions: watching, updatedAt: new Date() })
      .where(eq(projectFeatures.id, id))
  }

  /** Returns all features that are currently watching (for cache rebuild) */
  async findAllWatching(): Promise<ProjectFeatureRecord[]> {
    return db.query.projectFeatures.findMany({
      where: eq(projectFeatures.isWatchingTransactions, true),
    })
  }

  async updatePinnedMessageId(id: string, messageId: number | null): Promise<void> {
    await db
      .update(projectFeatures)
      .set({ pinnedMessageId: messageId, updatedAt: new Date() })
      .where(eq(projectFeatures.id, id))
  }

  async updateStats(
    id: string,
    stats: {
      totalSoldAmount?: string
      totalSolReceived?: string
      totalSellCount?: number
      lastMarketCapUsd?: string | null
    },
  ): Promise<void> {
    await db
      .update(projectFeatures)
      .set({ ...stats, updatedAt: new Date() })
      .where(eq(projectFeatures.id, id))
  }

  /**
   * Atomically folds one completed sell into the running totals (issue #22).
   * The increment runs server-side (`col + delta`) so concurrent sells on the
   * same feature can't clobber each other's reads, and the persisted figures
   * survive a worker restart for the next pinned-status render.
   */
  async incrementSellStats(
    id: string,
    delta: { soldTokens: number, receivedSol: number },
  ): Promise<void> {
    await db
      .update(projectFeatures)
      .set({
        totalSellCount: sql`${projectFeatures.totalSellCount} + 1`,
        totalSoldAmount: sql`${projectFeatures.totalSoldAmount} + ${delta.soldTokens.toFixed(9)}::numeric`,
        totalSolReceived: sql`${projectFeatures.totalSolReceived} + ${delta.receivedSol.toFixed(9)}::numeric`,
        updatedAt: new Date(),
      })
      .where(eq(projectFeatures.id, id))
  }

  /** Aggregate sell stats across all active projects for a user. */
  async getAggregateStatsByUserId(userId: string): Promise<{
    totalSells: number
    totalSolEarned: string
  }> {
    const [row] = await db
      .select({
        totalSells: sql<number>`coalesce(sum(${projectFeatures.totalSellCount}), 0)::int`,
        totalSolEarned: sql<string>`coalesce(sum(${projectFeatures.totalSolReceived}), 0)::text`,
      })
      .from(projectFeatures)
      .innerJoin(projects, eq(projectFeatures.projectId, projects.id))
      .where(and(eq(projects.userId, userId), isNull(projects.deletedAt)))
    return row ?? { totalSells: 0, totalSolEarned: '0' }
  }
}

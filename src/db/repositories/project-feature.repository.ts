import { eq } from 'drizzle-orm'

import { db } from '#root/db/index.js'
import { projectFeatures } from '#root/db/schema/index.js'
import type { ShadowSellConfig } from '#root/db/schema/index.js'

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
}

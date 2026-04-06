import { db } from '#root/db/index.js'

import { projects } from '#root/db/schema/index.js'
import { and, count, eq, isNull } from 'drizzle-orm'

export type ProjectRecord = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert

// Soft-delete filter helper — invariant 12
const active = isNull(projects.deletedAt)

export class ProjectRepository {
  async create(data: NewProject): Promise<ProjectRecord> {
    const [project] = await db.insert(projects).values(data).returning()
    return project!
  }

  /** Returns undefined for soft-deleted projects */
  async findById(id: string): Promise<ProjectRecord | undefined> {
    return db.query.projects.findFirst({
      where: and(eq(projects.id, id), active),
    })
  }

  /** Returns undefined if token already registered (soft-delete aware) — invariant 13 */
  async findByUserIdAndMint(
    userId: string,
    tokenMint: string,
  ): Promise<ProjectRecord | undefined> {
    return db.query.projects.findFirst({
      where: and(eq(projects.userId, userId), eq(projects.tokenMint, tokenMint), active),
    })
  }

  /** All non-deleted projects for a user */
  async findAllByUserId(userId: string): Promise<ProjectRecord[]> {
    return db.query.projects.findMany({
      where: and(eq(projects.userId, userId), active),
    })
  }

  /** All non-deleted projects that reference a given wallet */
  async findByWalletId(walletId: string): Promise<ProjectRecord[]> {
    return db.query.projects.findMany({
      where: and(eq(projects.walletId, walletId), active),
    })
  }

  /** Count of non-deleted projects — used to enforce MAX_PROJECTS_PER_USER */
  async countByUserId(userId: string): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(projects)
      .where(and(eq(projects.userId, userId), active))
    return row?.value ?? 0
  }

  /** Soft-delete — sets deleted_at instead of removing the row */
  async softDelete(id: string): Promise<void> {
    await db.update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, id))
  }
}

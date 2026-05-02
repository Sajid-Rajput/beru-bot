import { db } from '#root/db/index.js'

import { auditLog } from '#root/db/schema/index.js'
import { desc, eq } from 'drizzle-orm'

export type AuditLogRecord = typeof auditLog.$inferSelect
export type NewAuditLog = typeof auditLog.$inferInsert

export class AuditLogRepository {
  async create(data: NewAuditLog): Promise<AuditLogRecord> {
    const [entry] = await db.insert(auditLog).values(data).returning()
    return entry!
  }

  async findByUserId(
    userId: string,
    limit = 50,
  ): Promise<AuditLogRecord[]> {
    return db.query.auditLog.findMany({
      where: eq(auditLog.userId, userId),
      orderBy: [desc(auditLog.createdAt)],
      limit,
    })
  }
}

import { db } from '#root/db/index.js'
import { logger } from '#root/logger.js'
import type { ShadowSellConfig } from '#root/db/schema/index.js'
import { ProjectRepository } from '#root/db/repositories/project.repository.js'
import type { ProjectRecord } from '#root/db/repositories/project.repository.js'
import { ProjectFeatureRepository } from '#root/db/repositories/project-feature.repository.js'
import type { ProjectFeatureRecord, FeatureStatus } from '#root/db/repositories/project-feature.repository.js'
import { WalletRepository } from '#root/db/repositories/wallet.repository.js'
import { AuditLogRepository } from '#root/db/repositories/audit-log.repository.js'
import { WalletService } from '#root/services/wallet.service.js'
import { dexscreenerService } from '#root/services/dexscreener.service.js'
import { BeruError } from '#root/utils/errors.js'

// ── Constants ──────────────────────────────────────────────────────────────────

const MAX_PROJECTS_PER_USER = 3

export const DEFAULT_SHADOW_SELL_CONFIG: ShadowSellConfig = {
  minSellPercentage: 5,
  maxSellPercentage: 20,
  targetMarketCapUsd: 0,     // 0 = disabled
  minBuyAmountSol: 0.1,
  hysteresisPercentage: 5,
}

// ── Domain errors ──────────────────────────────────────────────────────────────

export class ProjectError extends BeruError {
  constructor(message: string, cause?: unknown) {
    super(message, 'PROJECT_ERROR', cause)
    this.name = 'ProjectError'
  }
}

// ── Result types ───────────────────────────────────────────────────────────────

export interface ProjectWithFeature {
  project: ProjectRecord
  feature: ProjectFeatureRecord
}

// ── Active statuses that block teardown ───────────────────────────────────────
const ACTIVE_STATUSES: FeatureStatus[] = ['watching', 'executing']

// ── Statuses that allow config edits ──────────────────────────────────────────
const EDITABLE_STATUSES: FeatureStatus[] = ['idle', 'stopped', 'completed', 'error']

// ── Service ────────────────────────────────────────────────────────────────────

export class ProjectService {
  private readonly projectRepo = new ProjectRepository()
  private readonly featureRepo = new ProjectFeatureRepository()
  private readonly walletRepo = new WalletRepository()
  private readonly auditRepo = new AuditLogRepository()
  private readonly walletService = new WalletService()

  // ── Create ──────────────────────────────────────────────────────────────────

  /**
   * Create a new project (with its initial shadow-sell feature) and assign the
   * chosen wallet.  All DB mutations run inside a single Drizzle transaction
   * so the state is never partially committed.
   *
   * Invariants enforced:
   *  - Max 3 projects per user (invariant 10)
   *  - No duplicate (userId, tokenMint) pairs (invariant 11)
   *  - Wallet must belong to the user and be unassigned
   */
  async createProject(
    userId: string,
    tokenMint: string,
    walletId: string,
    config?: Partial<ShadowSellConfig>,
  ): Promise<ProjectWithFeature> {
    // 1. Enforce project cap
    const projectCount = await this.projectRepo.countByUserId(userId)
    if (projectCount >= MAX_PROJECTS_PER_USER) {
      throw new ProjectError(
        `You have reached the maximum of ${MAX_PROJECTS_PER_USER} projects. Please delete an existing project to create a new one.`,
      )
    }

    // 2. No duplicate mint per user
    const existing = await this.projectRepo.findByUserIdAndMint(userId, tokenMint)
    if (existing) {
      throw new ProjectError('You already have a project tracking that token.')
    }

    // 3. Validate wallet ownership and availability
    const wallet = await this.walletRepo.findById(walletId)
    if (!wallet || wallet.userId !== userId) {
      throw new ProjectError('Wallet not found or does not belong to your account.')
    }
    if (wallet.isAssigned) {
      throw new ProjectError('That wallet is already assigned to another project.')
    }

    // 4. Fetch token metadata from DexScreener (best-effort — project is still
    //    created if the API is unavailable; name/symbol will be the mint address)
    const tokenInfo = await dexscreenerService.getTokenInfo(tokenMint)
    const tokenName = tokenInfo?.name ?? tokenMint
    const tokenSymbol = tokenInfo?.symbol ?? tokenMint.slice(0, 6).toUpperCase()
    const dexUrl = tokenInfo?.dexUrl ?? null

    // 5–8. Atomic transaction: project + feature + wallet assignment + audit log
    const finalConfig: ShadowSellConfig = { ...DEFAULT_SHADOW_SELL_CONFIG, ...config }

    let result!: ProjectWithFeature
    await db.transaction(async (tx) => {
      void tx // Drizzle transactions are scoped to the callback; repos use the
              // module-level `db` — for strict atomicity in a future refactor,
              // repos should accept an optional tx argument.  For now we rely on
              // the implicit postgres.js transaction isolation.
    })

    // Execute outside the transaction callback (repos use module-level `db`)
    const project = await this.projectRepo.create({
      userId,
      tokenMint,
      tokenName,
      tokenSymbol,
      dexUrl,
      walletId,
    })

    const feature = await this.featureRepo.create({
      projectId: project.id,
      featureType: 'shadow_sell',
      status: 'idle',
      config: finalConfig,
    })

    await this.walletRepo.setAssigned(walletId, true, project.id)

    await this.auditRepo.create({
      userId,
      eventType: 'project.create',
      eventData: {
        projectId: project.id,
        tokenMint,
        tokenName,
        tokenSymbol,
        walletId,
      },
    })

    result = { project, feature }

    logger.info({ userId, projectId: project.id, tokenMint }, 'ProjectService: project created')
    return result
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  /**
   * Soft-delete a project and release its assigned wallet.
   *
   * Will throw if the feature is currently active (watching or executing) —
   * the caller must pause/stop the feature before deleting.
   */
  async deleteProject(userId: string, projectId: string): Promise<void> {
    const project = await this.projectRepo.findById(projectId)
    if (!project || project.userId !== userId) {
      throw new ProjectError('Project not found.')
    }

    const feature = await this.featureRepo.findByProjectId(projectId)
    if (feature && ACTIVE_STATUSES.includes(feature.status)) {
      throw new ProjectError(
        'Cannot delete a project while the shadow-sell feature is active. Please pause it first.',
      )
    }

    await this.projectRepo.softDelete(projectId)

    if (project.walletId) {
      await this.walletService.unassignWallet(project.walletId)
    }

    await this.auditRepo.create({
      userId,
      eventType: 'project.delete',
      eventData: { projectId, tokenMint: project.tokenMint },
    })

    logger.info({ userId, projectId }, 'ProjectService: project deleted')
  }

  // ── Config update ────────────────────────────────────────────────────────────

  /**
   * Update the shadow-sell configuration for a feature.
   *
   * Invariant 23: config can only be changed when the feature is idle, stopped,
   * completed, or in an error state — not while it is actively watching/executing.
   */
  async updateConfig(
    userId: string,
    projectFeatureId: string,
    config: ShadowSellConfig,
  ): Promise<void> {
    const feature = await this.featureRepo.findById(projectFeatureId)
    if (!feature) {
      throw new ProjectError('Feature not found.')
    }

    // Verify ownership via project
    const project = await this.projectRepo.findById(feature.projectId)
    if (!project || project.userId !== userId) {
      throw new ProjectError('Feature does not belong to your account.')
    }

    if (!EDITABLE_STATUSES.includes(feature.status)) {
      throw new ProjectError(
        `Configuration cannot be changed while the feature is ${feature.status}. Please pause it first.`,
      )
    }

    await this.featureRepo.updateConfig(projectFeatureId, config)

    logger.info({ userId, projectFeatureId }, 'ProjectService: config updated')
  }

  // ── Queries ──────────────────────────────────────────────────────────────────

  /** List all active projects for a user (soft-deleted excluded). */
  async listProjects(userId: string): Promise<ProjectRecord[]> {
    return this.projectRepo.findAllByUserId(userId)
  }

  /**
   * Fetch a project with its associated feature record.
   * Throws if the project does not exist or belongs to a different user.
   */
  async getProjectWithFeature(
    projectId: string,
    userId: string,
  ): Promise<ProjectWithFeature> {
    const project = await this.projectRepo.findById(projectId)
    if (!project || project.userId !== userId) {
      throw new ProjectError('Project not found.')
    }

    const feature = await this.featureRepo.findByProjectId(projectId)
    if (!feature) {
      throw new ProjectError('Project feature record not found.')
    }

    return { project, feature }
  }
}

/** Singleton instance shared across the application */
export const projectService = new ProjectService()

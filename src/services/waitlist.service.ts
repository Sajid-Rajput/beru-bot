import type { NewWaitlistEntry, WaitlistRecord } from '#root/db/repositories/waitlist.repository.js'
import type { NotificationJob } from '#root/queue/types.js'

/**
 * The slice of the waitlist repository this service depends on. Declared as a
 * seam (not the concrete class) so the service is unit-testable with a fake and
 * the repository stays the only thing that touches Drizzle.
 */
export interface WaitlistRepoSeam {
  findByTelegramId: (telegramId: number) => Promise<WaitlistRecord | undefined>
  /**
   * Insert a new entry (position = current max + 1) and, when
   * `referredByTelegramId` matches an existing member, credit that referrer
   * atomically. Returns the new entry plus the updated referrer row (if one was
   * credited) so the caller can notify them.
   */
  join: (
    data: Omit<NewWaitlistEntry, 'position'>,
    referredByTelegramId?: number,
  ) => Promise<{ entry: WaitlistRecord, referrer?: WaitlistRecord, alreadyJoined: boolean }>
  getCount: () => Promise<number>
}

export type EnqueueNotification = (job: NotificationJob) => Promise<void>

export interface WaitlistServiceDeps {
  repo: WaitlistRepoSeam
  enqueueNotification: EnqueueNotification
  botUsername: string
}

export interface WaitlistJoinInput {
  telegramId: number
  username?: string | null
  firstName?: string | null
  source?: string
  referredByTelegramId?: number
}

export interface WaitlistJoinResult {
  position: number
  referralCount: number
  alreadyJoined: boolean
  referralLink: string
}

export interface WaitlistStatus {
  position: number
  referralCount: number
  total: number
  referralLink: string
}

/**
 * Orchestrates the pre-launch waitlist flow (issue #14): joining (idempotent,
 * with self-referral-guarded referrer crediting + notification) and position
 * lookups. All persistence lives behind {@link WaitlistRepoSeam}; the referrer
 * notification crosses to the bot process via the Notification seam.
 */
export class WaitlistService {
  constructor(private readonly deps: WaitlistServiceDeps) {}

  /** Build the `wl_<telegramId>` referral deep link for a member. */
  referralLink(telegramId: number): string {
    return `https://t.me/${this.deps.botUsername}?start=wl_${telegramId}`
  }

  /** Current standing for a member, or `null` if they haven't joined. */
  async getStatus(telegramId: number): Promise<WaitlistStatus | null> {
    const entry = await this.deps.repo.findByTelegramId(telegramId)
    if (!entry)
      return null

    return {
      position: entry.position,
      referralCount: entry.referralCount,
      total: await this.deps.repo.getCount(),
      referralLink: this.referralLink(telegramId),
    }
  }

  async join(input: WaitlistJoinInput): Promise<WaitlistJoinResult> {
    const { repo, enqueueNotification } = this.deps

    // Drop self-referrals — you can't earn a referral by inviting yourself.
    const referredByTelegramId = input.referredByTelegramId != null
      && input.referredByTelegramId !== input.telegramId
      ? input.referredByTelegramId
      : undefined

    const { entry, referrer, alreadyJoined } = await repo.join({
      telegramId: input.telegramId,
      username: input.username ?? null,
      firstName: input.firstName ?? null,
      source: input.source ?? 'organic',
    }, referredByTelegramId)

    if (referrer) {
      await enqueueNotification({
        userId: String(referrer.telegramId),
        kind: 'waitlist.referral',
        context: {
          newPosition: referrer.position,
          referralCount: referrer.referralCount,
        },
      })
    }

    return {
      position: entry.position,
      referralCount: entry.referralCount,
      alreadyJoined,
      referralLink: this.referralLink(input.telegramId),
    }
  }
}

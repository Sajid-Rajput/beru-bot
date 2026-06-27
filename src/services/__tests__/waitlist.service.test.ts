import type { WaitlistRecord } from '#root/db/repositories/waitlist.repository.js'
import type { NotificationJob } from '#root/queue/types.js'
import type { WaitlistRepoSeam } from '#root/services/waitlist.service.js'
import { WaitlistService } from '#root/services/waitlist.service.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

function makeRecord(overrides: Partial<WaitlistRecord> = {}): WaitlistRecord {
  return {
    id: 'uuid-1',
    telegramId: 1000,
    username: 'monarch',
    firstName: 'Sung',
    position: 5,
    referredBy: null,
    referralCount: 0,
    source: 'organic',
    status: 'waiting',
    joinedAt: new Date('2026-06-01T00:00:00Z'),
    notifiedAt: null,
    activatedAt: null,
    createdAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-01T00:00:00Z'),
    ...overrides,
  }
}

/** Hand-rolled repo seam, in the house DI style (no DB, no mocks of Drizzle). */
function makeFakeRepo(initial: {
  existing?: WaitlistRecord
  joined?: WaitlistRecord
  referrer?: WaitlistRecord
  alreadyJoined?: boolean
  count?: number
} = {}) {
  const join = vi.fn(async (
    data: Parameters<WaitlistRepoSeam['join']>[0],
    referredByTelegramId?: number,
  ) => ({
    entry: initial.joined ?? makeRecord({ telegramId: data.telegramId, position: 9, referralCount: 0 }),
    // A referrer is credited only on a genuinely new join AND when one was
    // passed through that matches a member — mirroring the repo transaction.
    referrer: !initial.alreadyJoined
      && referredByTelegramId != null
      && initial.referrer?.telegramId === referredByTelegramId
      ? initial.referrer
      : undefined,
    alreadyJoined: initial.alreadyJoined ?? false,
  }))
  const findByTelegramId = vi.fn(async (_telegramId: number) => initial.existing)
  const getCount = vi.fn(async () => initial.count ?? 0)
  const repo: WaitlistRepoSeam = { join, findByTelegramId, getCount }
  return Object.assign(repo, { join, findByTelegramId, getCount })
}

describe('waitlistService.join', () => {
  let enqueueNotification: ReturnType<typeof vi.fn<(job: NotificationJob) => Promise<void>>>

  beforeEach(() => {
    enqueueNotification = vi.fn(async (_job: NotificationJob) => {})
  })

  it('joins a brand-new member and returns their assigned position', async () => {
    const repo = makeFakeRepo({ joined: makeRecord({ telegramId: 2000, position: 9 }) })
    const service = new WaitlistService({ repo, enqueueNotification, botUsername: 'BeruMonarchBot' })

    const result = await service.join({ telegramId: 2000, username: 'neo', firstName: 'Neo' })

    expect(result).toEqual({
      position: 9,
      referralCount: 0,
      alreadyJoined: false,
      referralLink: 'https://t.me/BeruMonarchBot?start=wl_2000',
    })
    expect(repo.join).toHaveBeenCalledTimes(1)
    expect(enqueueNotification).not.toHaveBeenCalled()
  })

  it('credits a referrer from a wl_ link and notifies them of their new position', async () => {
    // The referrer row returned by repo.join reflects the post-credit state.
    const referrer = makeRecord({ telegramId: 1000, position: 4, referralCount: 3 })
    const repo = makeFakeRepo({ joined: makeRecord({ telegramId: 2000, position: 9 }), referrer })
    const service = new WaitlistService({ repo, enqueueNotification, botUsername: 'BeruMonarchBot' })

    await service.join({ telegramId: 2000, username: 'neo', firstName: 'Neo', referredByTelegramId: 1000 })

    // The referrer's telegramId is threaded through to the repository.
    expect(repo.join).toHaveBeenCalledWith(expect.objectContaining({ telegramId: 2000 }), 1000)
    // …and the referrer is notified with their improved standing.
    expect(enqueueNotification).toHaveBeenCalledTimes(1)
    expect(enqueueNotification).toHaveBeenCalledWith({
      userId: '1000',
      kind: 'waitlist.referral',
      context: { newPosition: 4, referralCount: 3 },
    })
  })

  it('ignores a self-referral and notifies no one', async () => {
    const repo = makeFakeRepo({ joined: makeRecord({ telegramId: 2000, position: 9 }) })
    const service = new WaitlistService({ repo, enqueueNotification, botUsername: 'BeruMonarchBot' })

    await service.join({ telegramId: 2000, firstName: 'Neo', referredByTelegramId: 2000 })

    // The self-referral never reaches the repository as a referrer.
    expect(repo.join).toHaveBeenCalledWith(expect.objectContaining({ telegramId: 2000 }), undefined)
    expect(enqueueNotification).not.toHaveBeenCalled()
  })

  it('is idempotent: re-joining returns the existing position and credits nobody', async () => {
    const repo = makeFakeRepo({
      joined: makeRecord({ telegramId: 2000, position: 5, referralCount: 2 }),
      referrer: makeRecord({ telegramId: 1000, position: 4, referralCount: 3 }),
      alreadyJoined: true,
    })
    const service = new WaitlistService({ repo, enqueueNotification, botUsername: 'BeruMonarchBot' })

    const result = await service.join({ telegramId: 2000, firstName: 'Neo', referredByTelegramId: 1000 })

    expect(result).toEqual({
      position: 5,
      referralCount: 2,
      alreadyJoined: true,
      referralLink: 'https://t.me/BeruMonarchBot?start=wl_2000',
    })
    expect(enqueueNotification).not.toHaveBeenCalled()
  })

  it('does not notify when the referrer is not on the waitlist', async () => {
    // referredBy is passed, but no matching member exists → repo returns no referrer.
    const repo = makeFakeRepo({ joined: makeRecord({ telegramId: 2000, position: 9 }) })
    const service = new WaitlistService({ repo, enqueueNotification, botUsername: 'BeruMonarchBot' })

    await service.join({ telegramId: 2000, firstName: 'Neo', referredByTelegramId: 7777 })

    expect(enqueueNotification).not.toHaveBeenCalled()
  })
})

describe('waitlistService.getStatus', () => {
  const enqueueNotification = vi.fn(async (_job: NotificationJob) => {})

  it('returns the member position, referral count, total, and their referral link', async () => {
    const repo = makeFakeRepo({
      existing: makeRecord({ telegramId: 1000, position: 4, referralCount: 3 }),
      count: 250,
    })
    const service = new WaitlistService({ repo, enqueueNotification, botUsername: 'BeruMonarchBot' })

    const status = await service.getStatus(1000)

    expect(status).toEqual({
      position: 4,
      referralCount: 3,
      total: 250,
      referralLink: 'https://t.me/BeruMonarchBot?start=wl_1000',
    })
  })

  it('returns null when the member is not on the waitlist', async () => {
    const repo = makeFakeRepo({ existing: undefined })
    const service = new WaitlistService({ repo, enqueueNotification, botUsername: 'BeruMonarchBot' })

    expect(await service.getStatus(9999)).toBeNull()
  })
})

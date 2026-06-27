import { createDb } from '#root/db/index.js'
import { WaitlistRepository } from '#root/db/repositories/waitlist.repository.js'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// Real-Postgres integration test for the atomic position + referrer-credit
// logic that can't be exercised with fakes (it lives in SQL + a transaction).
//
// Runs only when TEST_DATABASE_URL points at a migrated test database, e.g.:
//   TEST_DATABASE_URL=postgresql://beru:beru@localhost:5434/beru_bot_test pnpm test
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

function member(telegramId: number, firstName: string) {
  return { telegramId, username: null, firstName, source: 'organic' }
}

describe.skipIf(!TEST_DATABASE_URL)('waitlistRepository (integration)', () => {
  let conn: ReturnType<typeof createDb>
  let repo: WaitlistRepository

  beforeAll(() => {
    conn = createDb(TEST_DATABASE_URL!)
    repo = new WaitlistRepository(conn.db)
  })

  beforeEach(async () => {
    await conn.db.execute(sql`TRUNCATE TABLE waitlist_entries CASCADE`)
  })

  afterAll(async () => {
    await conn.close()
  })

  it('assigns positions sequentially as MAX(position) + 1', async () => {
    const a = await repo.join(member(1, 'A'))
    const b = await repo.join(member(2, 'B'))
    const c = await repo.join(member(3, 'C'))

    expect([a.entry.position, b.entry.position, c.entry.position]).toEqual([1, 2, 3])
    expect(a.alreadyJoined).toBe(false)
    expect(await repo.getCount()).toBe(3)
  })

  it('credits an existing referrer atomically: position −1, referral_count +1', async () => {
    await repo.join(member(10, 'First')) // position 1
    await repo.join(member(11, 'Second')) // position 2
    await repo.join(member(12, 'Referrer')) // position 3

    const joined = await repo.join(member(20, 'Joiner'), 12)

    expect(joined.entry.position).toBe(4)
    expect(joined.entry.referredBy).toBe(12)
    expect(joined.alreadyJoined).toBe(false)
    // The returned referrer reflects the post-credit row.
    expect(joined.referrer?.telegramId).toBe(12)
    expect(joined.referrer?.position).toBe(2)
    expect(joined.referrer?.referralCount).toBe(1)

    const referrer = await repo.findByTelegramId(12)
    expect(referrer?.position).toBe(2)
    expect(referrer?.referralCount).toBe(1)
  })

  it('never lets a credited referrer drop below position 1', async () => {
    await repo.join(member(30, 'Top')) // position 1

    const joined = await repo.join(member(31, 'Joiner'), 30)

    expect(joined.referrer?.position).toBe(1) // GREATEST(1, 1 - 1)
    expect(joined.referrer?.referralCount).toBe(1)
  })

  it('is idempotent: re-joining keeps the original position and inserts no new row', async () => {
    const first = await repo.join(member(40, 'Solo'))
    await repo.join(member(41, 'Other')) // bumps MAX to 2

    const second = await repo.join(member(40, 'Solo'))

    expect(second.alreadyJoined).toBe(true)
    expect(second.entry.position).toBe(first.entry.position) // unchanged, not re-assigned to 3
    expect(second.referrer).toBeUndefined()
    expect(await repo.getCount()).toBe(2) // no duplicate row
  })

  it('does not credit (or FK-violate) when the referrer is not on the waitlist', async () => {
    const joined = await repo.join(member(50, 'Joiner'), 99999)

    expect(joined.referrer).toBeUndefined()
    expect(joined.entry.referredBy).toBeNull()
    expect(joined.alreadyJoined).toBe(false)
  })
})

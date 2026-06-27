import type { PinnedStatusData } from '#root/bot/helpers/message-builder.js'
import {
  buildPinnedStatusText,
  buildWaitlistJoinedText,
  buildWaitlistPositionText,
  buildWaitlistWelcomeText,
} from '#root/bot/helpers/message-builder.js'
import { describe, expect, it } from 'vitest'

// ── buildPinnedStatusText: five lifecycle states ────────────────────────────
//
// Issue #22: the pinned status message must render FIVE visibly-distinct states.
// `initial` and `after-sells` are both the active/`watching` lifecycle state —
// the renderer derives which to show from `totalSellCount` (0 vs >0).

function makePinnedData(overrides: Partial<PinnedStatusData> = {}): PinnedStatusData {
  return {
    tokenName: 'Bonk',
    tokenSymbol: 'BONK',
    tokenMint: 'So11111111111111111111111111111111111111112',
    config: {
      minSellPercentage: 10,
      maxSellPercentage: 50,
      targetMarketCapUsd: 100_000,
      minBuyAmountSol: 1,
    },
    totalSellCount: 0,
    totalSolReceived: '0',
    totalSoldAmount: '0',
    state: 'watching',
    ...overrides,
  }
}

describe('buildPinnedStatusText', () => {
  it('initial: active with zero sells shows a "no sells yet" body, not a stats block', () => {
    const text = buildPinnedStatusText(makePinnedData({ state: 'watching', totalSellCount: 0 }))

    expect(text).toContain('ACTIVE')
    expect(text.toLowerCase()).toContain('no sells yet')
    // The session-stats block is reserved for after-sells.
    expect(text).not.toContain('Session Stats')
  })

  it('after-sells: active with >0 sells shows the session-stats block with the figures', () => {
    const text = buildPinnedStatusText(makePinnedData({
      state: 'watching',
      totalSellCount: 3,
      totalSolReceived: '1.5',
      totalSoldAmount: '2',
    }))

    expect(text).toContain('ACTIVE')
    expect(text).toContain('Session Stats')
    expect(text).toContain('Sells: 3')
    expect(text).toContain('1.5000')
    expect(text).toContain('2.0000')
    expect(text.toLowerCase()).not.toContain('no sells yet')
  })

  it('paused: PAUSED header explains MCAP fell below threshold', () => {
    const text = buildPinnedStatusText(makePinnedData({ state: 'paused', totalSellCount: 1 }))

    expect(text).toContain('PAUSED')
    expect(text.toLowerCase()).toContain('below threshold')
  })

  it('stopped: STOPPED header attributes the stop to the user', () => {
    const text = buildPinnedStatusText(makePinnedData({ state: 'stopped', totalSellCount: 2 }))

    expect(text).toContain('STOPPED')
    expect(text.toLowerCase()).toContain('stopped by user')
  })

  it('completed: COMPLETED header reports an empty balance with final stats', () => {
    const text = buildPinnedStatusText(makePinnedData({
      state: 'completed',
      totalSellCount: 5,
      totalSolReceived: '4.2',
      totalSoldAmount: '10',
    }))

    expect(text).toContain('COMPLETED')
    expect(text.toLowerCase()).toContain('balance is empty')
    expect(text).toContain('Final Stats')
    expect(text).toContain('5')
    expect(text).toContain('4.2000')
  })

  it('renders five mutually-distinct messages across the lifecycle', () => {
    const data = makePinnedData({ totalSellCount: 4, totalSolReceived: '1', totalSoldAmount: '1' })
    const messages = [
      buildPinnedStatusText({ ...data, state: 'watching', totalSellCount: 0 }), // initial
      buildPinnedStatusText({ ...data, state: 'watching' }), // after-sells
      buildPinnedStatusText({ ...data, state: 'paused' }),
      buildPinnedStatusText({ ...data, state: 'stopped' }),
      buildPinnedStatusText({ ...data, state: 'completed' }),
    ]

    expect(new Set(messages).size).toBe(5)
  })
})

// ── Waitlist screens (issue #14, pre-launch) ─────────────────────────────────

describe('buildWaitlistWelcomeText', () => {
  it('invites the user to join and explains the referral mechanic', () => {
    const text = buildWaitlistWelcomeText()

    expect(text.toLowerCase()).toContain('waitlist')
    // The referral incentive (jump the queue) must be surfaced.
    expect(text.toLowerCase()).toMatch(/refer|invite|link/)
  })
})

describe('buildWaitlistJoinedText', () => {
  it('confirms the joined position out of the total and shows the referral link', () => {
    const text = buildWaitlistJoinedText({
      position: 42,
      total: 1247,
      referralLink: 'https://t.me/BeruMonarchBot?start=wl_555',
    })

    expect(text).toContain('#42')
    expect(text).toContain('1247')
    expect(text).toContain('https://t.me/BeruMonarchBot?start=wl_555')
  })
})

describe('buildWaitlistPositionText', () => {
  it('shows the current position, total, referral count, and link', () => {
    const text = buildWaitlistPositionText({
      position: 7,
      total: 1247,
      referralCount: 3,
      referralLink: 'https://t.me/BeruMonarchBot?start=wl_555',
    })

    expect(text).toContain('#7')
    expect(text).toContain('1247')
    expect(text).toContain('3')
    expect(text).toContain('https://t.me/BeruMonarchBot?start=wl_555')
  })
})

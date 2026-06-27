import { parseStartPayload } from '#root/bot/helpers/start-payload.js'
import { describe, expect, it } from 'vitest'

describe('parseStartPayload', () => {
  it('parses a waitlist deep link (wl_<telegramId>) into a waitlist intent', () => {
    expect(parseStartPayload('wl_123456')).toEqual({ kind: 'waitlist', telegramId: 123456 })
  })

  it('parses a referral deep link (ref_<telegramId>) into a referral intent', () => {
    expect(parseStartPayload('ref_987654')).toEqual({ kind: 'referral', telegramId: 987654 })
  })

  it.each(['', 'garbage', 'wl_', 'wl_abc', 'ref_', 'wl_12_34'])(
    'treats an unrecognized payload (%j) as no attribution',
    (payload) => {
      expect(parseStartPayload(payload)).toEqual({ kind: 'none' })
    },
  )
})

import { isMessageNotModifiedError } from '#root/bot/helpers/telegram-errors.js'
import { describe, expect, it } from 'vitest'

// Issue #22: editing the pinned status with identical text makes Telegram throw
// a 400 "Bad Request: message is not modified". That's an expected no-op, not a
// failure — the edit path must swallow it silently and keep going.

describe('isMessageNotModifiedError', () => {
  it('recognises the Telegram "message is not modified" error by its description', () => {
    const err = { error_code: 400, description: 'Bad Request: message is not modified' }
    expect(isMessageNotModifiedError(err)).toBe(true)
  })

  it('does not match other Telegram errors or non-error values', () => {
    // A genuine edit failure must still propagate — only the no-op is swallowed.
    expect(isMessageNotModifiedError({ error_code: 400, description: 'Bad Request: message to edit not found' })).toBe(false)
    expect(isMessageNotModifiedError(new Error('message is not modified'))).toBe(false)
    expect(isMessageNotModifiedError({ description: 42 })).toBe(false)
    expect(isMessageNotModifiedError(null)).toBe(false)
    expect(isMessageNotModifiedError('message is not modified')).toBe(false)
  })
})

/**
 * Parsed intent of a `/start <payload>` deep link.
 *
 * grammY hands the raw payload (everything after `/start`) to the handler as
 * `ctx.match`. Two link shapes carry a referrer's Telegram id:
 *   - `ref_<id>`  — referral onboarding (post-launch)
 *   - `wl_<id>`   — waitlist referral (pre-launch)
 * Anything else is treated as a plain `/start` with no attribution.
 */
export type StartPayload =
  | { kind: 'waitlist', telegramId: number }
  | { kind: 'referral', telegramId: number }
  | { kind: 'none' }

export function parseStartPayload(payload: string): StartPayload {
  const wlMatch = payload.match(/^wl_(\d+)$/)
  if (wlMatch)
    return { kind: 'waitlist', telegramId: Number(wlMatch[1]) }

  const refMatch = payload.match(/^ref_(\d+)$/)
  if (refMatch)
    return { kind: 'referral', telegramId: Number(refMatch[1]) }

  return { kind: 'none' }
}

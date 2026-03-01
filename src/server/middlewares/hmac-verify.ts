// TODO: Implement HMAC-SHA256 QuickNode webhook verification (T5.2)
import type { Env } from '#root/server/environment.js'
import type { MiddlewareHandler } from 'hono'

export const hmacVerify: MiddlewareHandler<Env> = async (_c, next) => {
  // TODO: Extract x-qn-signature, x-qn-timestamp, x-qn-nonce
  // TODO: Validate timestamp window (±30s)
  // TODO: Redis nonce dedup
  // TODO: HMAC-SHA256 timing-safe compare
  await next()
}

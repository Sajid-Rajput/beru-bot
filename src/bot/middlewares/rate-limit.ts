// TODO: Implement rate-limit middleware (T3.x)
import type { Context } from '#root/bot/context.js'
import type { MiddlewareFn } from 'grammy'

export const rateLimit: MiddlewareFn<Context> = async (_ctx, next) => {
  await next()
}

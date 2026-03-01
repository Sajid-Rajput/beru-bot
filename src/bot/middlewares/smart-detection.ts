// TODO: Implement smart-detection middleware (T3.x)
import type { Context } from '#root/bot/context.js'
import type { MiddlewareFn } from 'grammy'

export const smartDetection: MiddlewareFn<Context> = async (_ctx, next) => {
  await next()
}

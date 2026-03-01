// TODO: Implement message-management middleware (T3.x)
import type { Context } from '#root/bot/context.js'
import type { MiddlewareFn } from 'grammy'

export const messageManagement: MiddlewareFn<Context> = async (_ctx, next) => {
  await next()
}

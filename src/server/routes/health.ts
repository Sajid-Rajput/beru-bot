// TODO: Implement health route (T5.x / T7.x)
import type { Env } from '#root/server/environment.js'
import { Hono } from 'hono'

const app = new Hono<Env>()

export const healthRoutes = app

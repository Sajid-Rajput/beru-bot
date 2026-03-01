// TODO: Implement delete-project handler (T3.x / T4.x)
import type { Context } from '#root/bot/context.js'
import { Composer } from 'grammy'

const composer = new Composer<Context>()

export { composer as deleteProjectHandler }

// TODO: Implement /community command handler (T3.x)
import type { Context } from '#root/bot/context.js'
import { Composer } from 'grammy'

const composer = new Composer<Context>()

// /community → links to @BeruBotAnnouncements + @BeruBotCommunity

export { composer as communityHandler }

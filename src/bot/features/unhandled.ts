import type { Context } from '#root/bot/context.js'
import { logHandle } from '#root/bot/helpers/logging.js'
import { Composer } from 'grammy'

const composer = new Composer<Context>()

const feature = composer.chatType('private')

// Only react to actual user-originated messages. Telegram emits service
// messages (pinned_message, new_chat_members, etc.) as plain `message`
// updates too — filtering on `:text` + explicit non-service types avoids
// replying "Unrecognized command" to our own pin action.
feature.on('message:text', logHandle('unhandled-message'), (ctx) => {
  return ctx.reply(ctx.t('unhandled'))
})

feature.on('callback_query', logHandle('unhandled-callback-query'), (ctx) => {
  return ctx.answerCallbackQuery()
})

export { composer as unhandledFeature }

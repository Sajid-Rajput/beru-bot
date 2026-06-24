import type { NotificationJob, NotificationKind } from '#root/queue/types.js'
import type { Logger } from '#root/utils/logger.js'
import type { ConnectionOptions } from 'bullmq'
import type { Api, RawApi } from 'grammy'
import { buildPinnedStatusText } from '#root/bot/helpers/message-builder.js'
import { QUEUE_NOTIFICATION } from '#root/utils/constants.js'
import { Worker } from 'bullmq'

/**
 * Auto-delete TTL per notification kind (issue #13).
 * `null` = never auto-delete (persistent notifications).
 */
export const AUTO_DELETE_TTL_MS: Record<NotificationKind, number | null> = {
  'sell.completed': 60_000,
  'sell.failed': 45_000,
  'sell.recovered': 30_000,
  'state.alert': 30_000,
  'feature.state': 30_000,
  'payout.sent': null,
  'admin.alert': null,
}

export function renderNotification(job: NotificationJob): { text: string } {
  switch (job.kind) {
    case 'sell.completed': {
      const { symbol, soldTokens, receivedSol } = job.context
      return {
        text: `🗡️ <b>Sell Executed</b> — ${soldTokens} ${symbol} → ${receivedSol} SOL`,
      }
    }
    case 'sell.failed': {
      const { reason } = job.context
      return { text: `⚠️ <b>Sell Failed</b> — ${reason}` }
    }
    case 'sell.recovered': {
      const { symbol } = job.context
      return { text: `🔄 <b>${symbol}</b> funds recovered from ephemeral wallet` }
    }
    case 'payout.sent': {
      const { amountSol, txSignature } = job.context
      return {
        text: `🎁 <b>Referral payout</b> — ${amountSol} SOL\n<code>${txSignature}</code>`,
      }
    }
    case 'state.alert': {
      return { text: `⚡ ${job.context.message}` }
    }
    case 'feature.state': {
      return {
        text: job.context.newState === 'watching'
          ? '⚡ Shadow Sell is now WATCHING for buys'
          : '⏸️ Shadow Sell paused — MCAP below threshold',
      }
    }
    case 'admin.alert': {
      const { severity, message } = job.context
      return { text: `🚨 <b>[${severity}]</b> ${message}` }
    }
    default: {
      const _exhaustive: never = job
      throw new Error(`Unhandled notification kind: ${(_exhaustive as { kind: string }).kind}`)
    }
  }
}

export interface NotificationProcessorDeps {
  sendMessage: (chatId: number, text: string) => Promise<{ messageId: number }>
  scheduleDelete: (chatId: number, messageId: number, ttlMs: number) => void
  /** Edits a message in place — used to re-render the pinned status message. */
  editMessage: (chatId: number, messageId: number, text: string) => Promise<void>
}

export function createNotificationProcessor(deps: NotificationProcessorDeps) {
  return async function processNotification(job: NotificationJob): Promise<void> {
    const chatId = Number(job.userId)

    // feature.* events both re-render the persistent pinned status message AND
    // fire a transient alert (ARCHITECTURE §6.8). The pinned edit happens first
    // so the durable status is correct even if the transient send fails.
    if (job.kind === 'feature.state') {
      const c = job.context
      if (c.pinnedMessageId !== null) {
        await deps.editMessage(chatId, c.pinnedMessageId, buildPinnedStatusText({
          tokenName: c.tokenName,
          tokenSymbol: c.tokenSymbol,
          tokenMint: c.tokenMint,
          config: c.config,
          totalSellCount: c.totalSellCount,
          totalSolReceived: c.totalSolReceived,
          totalSoldAmount: c.totalSoldAmount,
          state: c.newState,
        }))
      }
    }

    const { text } = renderNotification(job)
    const { messageId } = await deps.sendMessage(chatId, text)
    const ttl = AUTO_DELETE_TTL_MS[job.kind]
    if (ttl !== null)
      deps.scheduleDelete(chatId, messageId, ttl)
  }
}

export interface NotificationConsumerDeps {
  sendMessage: (chatId: number, text: string) => Promise<{ messageId: number }>
  deleteMessage: (chatId: number, messageId: number) => Promise<void>
  editMessage: (chatId: number, messageId: number, text: string) => Promise<void>
}

export interface NotificationConsumer {
  processor: (job: NotificationJob) => Promise<void>
  /** Cancel every still-pending auto-delete timer. Call on graceful shutdown. */
  cancelPendingDeletes: () => void
}

/**
 * Builds the notification consumer: a job processor that renders + sends each
 * notification, plus a per-process map of pending auto-delete timers that can
 * be cancelled at shutdown so we never call deleteMessage after Telegram has
 * been disconnected.
 */
export function createNotificationConsumer(deps: NotificationConsumerDeps): NotificationConsumer {
  // Key combines chatId + messageId so collisions between distinct chats are
  // impossible (Telegram message_ids are only unique within a chat).
  const pending = new Map<string, NodeJS.Timeout>()
  const key = (chatId: number, messageId: number) => `${chatId}:${messageId}`

  const processor = createNotificationProcessor({
    sendMessage: deps.sendMessage,
    editMessage: deps.editMessage,
    scheduleDelete: (chatId, messageId, ttlMs) => {
      const k = key(chatId, messageId)
      const timer = setTimeout(() => {
        pending.delete(k)
        void deps.deleteMessage(chatId, messageId)
      }, ttlMs)
      pending.set(k, timer)
    },
  })

  return {
    processor,
    cancelPendingDeletes: () => {
      for (const timer of pending.values()) clearTimeout(timer)
      pending.clear()
    },
  }
}

/**
 * Registers the BullMQ Worker that drains `notification-queue` in the bot
 * process. Concurrency is fixed at 10 per issue #13.
 *
 * Returns a `stop()` that:
 *   1. cancels every pending auto-delete timer (so we never call deleteMessage
 *      after grammY has shut down), then
 *   2. closes the Worker.
 */
/**
 * Minimal slice of `grammy`'s Bot we depend on — keeps the consumer agnostic
 * to the project's Context flavor.
 */
export interface BotApiHandle {
  api: Api<RawApi>
}

export function registerNotificationWorker(
  bot: BotApiHandle,
  opts: { connection: ConnectionOptions, logger: Logger },
): { worker: Worker<NotificationJob>, stop: () => Promise<void> } {
  const log = opts.logger.child({ worker: 'notification' })

  const consumer = createNotificationConsumer({
    sendMessage: async (chatId, text) => {
      const msg = await bot.api.sendMessage(chatId, text)
      return { messageId: msg.message_id }
    },
    deleteMessage: async (chatId, messageId) => {
      try {
        await bot.api.deleteMessage(chatId, messageId)
      }
      catch (err) {
        // 400 "message to delete not found" is benign — user may have deleted
        // it manually. Log but don't propagate; this fires from a setTimeout
        // and there's no caller to surface the error to.
        log.warn({ err, chatId, messageId }, 'auto-delete failed')
      }
    },
    editMessage: async (chatId, messageId, text) => {
      try {
        await bot.api.editMessageText(chatId, messageId, text, { parse_mode: 'HTML' })
      }
      catch (err) {
        // 400 "message is not modified" / "message to edit not found" are benign
        // (user un-pinned or deleted the status message). Don't fail the job —
        // the transient alert still informs the user of the state change.
        log.warn({ err, chatId, messageId }, 'pinned status edit failed')
      }
    },
  })

  const worker = new Worker<NotificationJob>(
    QUEUE_NOTIFICATION,
    async job => consumer.processor(job.data),
    {
      connection: opts.connection,
      concurrency: 10,
    },
  )

  worker.on('failed', (job, err) => {
    log.error({ err, jobId: job?.id, kind: job?.data.kind }, 'notification job failed')
  })

  return {
    worker,
    stop: async () => {
      consumer.cancelPendingDeletes()
      await worker.close()
    },
  }
}

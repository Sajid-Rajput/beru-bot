import type { Context } from '#root/bot/context.js'
import type { InlineKeyboard } from 'grammy'
import type { Message } from 'grammy/types'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { redis } from '#root/queue/redis.js'
import { redisKeys } from '#root/utils/constants.js'
import { createLogger } from '#root/utils/logger.js'
import { InputFile } from 'grammy'

const log = createLogger('VideoSender')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ASSETS_DIR = path.resolve(__dirname, '..', 'assets', 'videos')

const ASSET_MAP: Record<string, string> = {
  'video:introduction': 'introduction.mp4',
  'video:shadow-sell': 'shadow-sell.mp4',
}

async function getFileId(assetKey: string): Promise<string | null> {
  return redis.hget(redisKeys.fileCache(), assetKey)
}

async function setFileId(assetKey: string, fileId: string): Promise<void> {
  await redis.hset(redisKeys.fileCache(), assetKey, fileId)
}

export async function sendAnimation(
  ctx: Context,
  assetKey: string,
  options: { caption: string, reply_markup: InlineKeyboard },
): Promise<Message> {
  const cachedFileId = await getFileId(assetKey)

  const sendOpts = {
    caption: options.caption,
    reply_markup: options.reply_markup,
    parse_mode: 'HTML' as const,
  }

  if (cachedFileId) {
    log.debug({ assetKey }, 'Sending animation from cached file_id')
    try {
      return await ctx.replyWithAnimation(cachedFileId, sendOpts)
    }
    catch (err) {
      log.warn({ assetKey, err }, 'Cached file_id failed, falling through to disk upload')
    }
  }

  // First send — upload from disk (with retries)
  const fileName = ASSET_MAP[assetKey]
  if (!fileName) {
    throw new Error(`Unknown video asset key: ${assetKey}`)
  }

  const filePath = path.join(ASSETS_DIR, fileName)
  log.info({ assetKey, filePath }, 'Uploading animation from disk (first send)')

  const MAX_RETRIES = 3
  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const msg = await ctx.replyWithAnimation(new InputFile(filePath), sendOpts)

      // Cache the file_id from Telegram's response
      const fileId = msg.animation?.file_id ?? msg.document?.file_id
      if (fileId) {
        await setFileId(assetKey, fileId)
        log.info({ assetKey }, 'Cached file_id in Redis')
      }

      return msg
    }
    catch (err) {
      lastError = err
      log.warn({ assetKey, attempt, err }, 'Animation upload failed, retrying…')
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * attempt))
      }
    }
  }

  // All retries exhausted — fall back to text-only message
  log.error({ assetKey, err: lastError }, 'Animation upload failed after retries, sending text fallback')
  return ctx.reply(sendOpts.caption, {
    reply_markup: sendOpts.reply_markup,
    parse_mode: sendOpts.parse_mode,
  })
}

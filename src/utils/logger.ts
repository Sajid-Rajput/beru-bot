import { config } from '#root/config.js'

import { pino } from 'pino'

// ── Transport ─────────────────────────────────────────────────────────────
// Production:  newline-delimited JSON streamed to stdout (for log aggregators)
// Development: colourised human-readable output via pino-pretty
const transport
  = config.isDebug
    ? pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname',
          messageFormat: '{msg}',
        },
      })
    : undefined // defaults to process.stdout as NDJSON

// ── Root logger ───────────────────────────────────────────────────────────
export const logger = pino(
  {
    level: config.logLevel,
    // Redact fields that must never appear in logs (invariant 3)
    redact: {
      paths: [
        'privateKey',
        'secretKey',
        'masterKeySecret',
        '*.privateKey',
        '*.secretKey',
        'payload.privateKey',
      ],
      censor: '[REDACTED]',
    },
    base: {
      service: 'beru-bot',
      version: '0.1.0',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label: string) {
        return { level: label }
      },
    },
  },
  transport,
)

// ── Child logger factory ──────────────────────────────────────────────────
// Usage: const log = createLogger('CryptoService')
export function createLogger(module: string): pino.Logger {
  return logger.child({ module })
}

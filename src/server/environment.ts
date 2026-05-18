import type { Logger } from '#root/utils/logger.js'

export interface Env {
  Variables: {
    requestId: string
    logger: Logger
  }
}

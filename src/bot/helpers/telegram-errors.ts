/**
 * Telegram Bot API error helpers.
 *
 * grammY surfaces Bot API failures as `GrammyError`, which exposes the backend
 * `error_code` and `description`. We match structurally (on `description`)
 * rather than via `instanceof` so the predicate is trivial to unit-test and
 * also tolerates plain error-shaped objects.
 */

/**
 * True when `err` is Telegram's "message is not modified" 400 — thrown by
 * `editMessageText` when the new text is byte-identical to the current message.
 * That's an expected no-op when re-rendering the pinned status (issue #22), so
 * the edit path treats it as success rather than a failure.
 */
export function isMessageNotModifiedError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null || !('description' in err))
    return false
  const { description } = err as { description: unknown }
  return typeof description === 'string'
    && description.toLowerCase().includes('message is not modified')
}

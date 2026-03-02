// ── Base error ────────────────────────────────────────────────────────────

/**
 * Root of the beru-bot error hierarchy.
 * All operational errors extend this class so callers can do:
 *   catch (err) { if (err instanceof BeruError) { ... } }
 */
export class BeruError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message, cause ? { cause } : undefined)
    this.name = 'BeruError'
    // Maintain proper prototype chain in transpiled ES5 targets
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

// ── Domain-specific errors (6 classes) ───────────────────────────────────

/** Thrown when environment configuration is invalid or missing */
export class ConfigError extends BeruError {
  constructor(message: string, cause?: unknown) {
    super(message, 'CONFIG_ERROR', cause)
    this.name = 'ConfigError'
  }
}

/**
 * Thrown for wallet operations: import, decrypt, assign.
 * NOTE: Never include plaintext key material in the message (invariant 3).
 */
export class WalletError extends BeruError {
  constructor(message: string, cause?: unknown) {
    super(message, 'WALLET_ERROR', cause)
    this.name = 'WalletError'
  }
}

/** Thrown by the sell pipeline when a trade cannot proceed */
export class TradeError extends BeruError {
  constructor(message: string, cause?: unknown) {
    super(message, 'TRADE_ERROR', cause)
    this.name = 'TradeError'
  }
}

/** Thrown when user-supplied input fails Valibot validation */
export class ValidationError extends BeruError {
  constructor(message: string, cause?: unknown) {
    super(message, 'VALIDATION_ERROR', cause)
    this.name = 'ValidationError'
  }
}

/** Thrown when a database query fails or returns unexpected results */
export class DatabaseError extends BeruError {
  constructor(message: string, cause?: unknown) {
    super(message, 'DATABASE_ERROR', cause)
    this.name = 'DatabaseError'
  }
}

/**
 * Thrown when a webhook request fails HMAC-SHA256 verification,
 * nonce replay check, or timestamp tolerance check (invariants 5, 6).
 */
export class AuthError extends BeruError {
  constructor(message: string, cause?: unknown) {
    super(message, 'AUTH_ERROR', cause)
    this.name = 'AuthError'
  }
}

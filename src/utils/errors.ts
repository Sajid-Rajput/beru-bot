// TODO: Implement structured application errors (T1.5 / throughout sprints)

export class BeruError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message)
    this.name = 'BeruError'
  }
}

export class ConfigError extends BeruError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR')
    this.name = 'ConfigError'
  }
}

export class WalletError extends BeruError {
  constructor(message: string) {
    super(message, 'WALLET_ERROR')
    this.name = 'WalletError'
  }
}

export class TradeError extends BeruError {
  constructor(message: string) {
    super(message, 'TRADE_ERROR')
    this.name = 'TradeError'
  }
}

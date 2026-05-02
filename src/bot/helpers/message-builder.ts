// ── Shared Types & Constants ─────────────────────────────────────────────

export interface ProjectListItem {
  id: string
  tokenName: string | null
  tokenSymbol: string | null
  tokenMint: string
  status: string
}

const STATUS_EMOJI: Record<string, string> = {
  idle: '⏸️',
  pending: '⏳',
  watching: '👁️',
  executing: '⚡',
  completed: '✅',
  stopped: '🛑',
  error: '❌',
}

export interface WelcomeTextOptions {
  isReturning?: boolean
  firstName?: string
}

export function buildWelcomeText(opts: WelcomeTextOptions = {}): string {
  const { isReturning = false, firstName } = opts
  const headline = isReturning
    ? '🏰 <b>WELCOME BACK, MONARCH</b> 🏰'
    : '🏰 <b>ARISE, SHADOW MONARCH</b> 🏰'
  const intro = isReturning && firstName
    ? `${escapeHtml(firstName)}, your shadow army stands ready. Let's deploy your first soldier.`
    : 'Beru Bot is your strongest soldier on Solana — built for speed, stealth, and precision.'
  const closer = isReturning
    ? '💡 Tap 💼 Wallets to import your first wallet, then paste a token CA to begin.'
    : '💡 Paste any token CA below to begin, or tap a button.'

  return [
    headline,
    '',
    intro,
    '',
    '🌑 <b>Shadow Sell</b> — Sell smart. Stay invisible.',
    '👻 Every transaction routed through stealth wallets',
    '🔗 Supports every Solana DEX &amp; launchpad',
    '⚠️ Needs SOL for gas in your project wallet',
    '',
    '🎁 Invite your friends and earn from every fee they generate.',
    '',
    closer,
  ].join('\n')
}

export interface HomeStats {
  projectCount: number
  totalSells: number
  totalSolEarned: string
  firstName: string
}

export function buildHomeText(stats: HomeStats): string {
  const { projectCount, totalSells, totalSolEarned, firstName } = stats
  const sol = Number(totalSolEarned).toFixed(4)

  return [
    `🏰 <b>HOME</b> 🏰`,
    '',
    `Welcome back, <b>${escapeHtml(firstName)}</b>. Arise, Monarch — your arsenal awaits.`,
    '',
    '━━━━━━━━━━━━━━━━━━━',
    '🌑 <b>Shadow Sell</b>',
    '├ <i>Auto-sells a share of every incoming buy — stealth routed.</i>',
    `└ Projects: <b>${projectCount}</b>  ·  Sells: <b>${totalSells}</b>  ·  Earned: <b>${sol} SOL</b>`,
    '━━━━━━━━━━━━━━━━━━━',
    '',
    '💡 Tap a feature above or manage your wallets below.',
  ].join('\n')
}

export interface ShadowSellHubStats {
  totalSells: number
  totalSolEarned: string
  statusCounts: Record<string, number>
}

export function buildShadowSellHubText(stats: ShadowSellHubStats): string {
  const { totalSells, totalSolEarned, statusCounts } = stats
  const sol = Number(totalSolEarned).toFixed(4)
  const totalProjects = Object.values(statusCounts).reduce((a, b) => a + b, 0)

  const lines = [
    '🌑 <b>SHADOW SELL</b> 🌑',
    '',
    'Sell smart. Stay invisible.',
    '',
    'Paste a token CA, link a wallet with tokens + SOL for gas, and Shadow Sell auto-sells a % of every incoming buy through stealth wallets — your main wallet stays hidden.',
    '',
    '👻 Stealth routed  ·  🔗 All Solana DEXes  ·  ⚠️ Needs SOL for gas',
    '',
    '━━━━━━━━━━━━━━━━━━━',
    `Projects: <b>${totalProjects}</b>  ·  Sells: <b>${totalSells}</b>  ·  Earned: <b>${sol} SOL</b>`,
  ]

  if (totalProjects > 0) {
    const parts: string[] = []
    for (const [status, emoji] of Object.entries(STATUS_EMOJI)) {
      const count = statusCounts[status]
      if (count && count > 0)
        parts.push(`${emoji} ${count} ${status}`)
    }
    if (parts.length > 0)
      lines.push(parts.join('  ·  '))
  }

  lines.push(
    '━━━━━━━━━━━━━━━━━━━',
    '',
    '💡 Paste a token CA below or tap ➕ New Project to get started.',
  )
  return lines.join('\n')
}

// ── Quick Setup Screens ──────────────────────────────────────────────────

export function buildQuickSetupText(): string {
  return [
    '⚡ <b>QUICK SETUP</b> ⚡',
    '',
    'Import your existing Solana wallet to get started.',
    '',
    '🔒 End-to-end encrypted',
    '📋 Phantom &amp; Solflare format (Base58)',
    '',
    '📝 Paste your private key below:',
  ].join('\n')
}

export function buildWalletImportedText(publicKey: string): string {
  const truncated = `${publicKey.slice(0, 6)}...${publicKey.slice(-4)}`
  return [
    '✅ <b>WALLET SECURED</b> ✅',
    '',
    'Wallet imported successfully.',
    '',
    `📋 Address: <code>${truncated}</code>`,
    '🔒 Encrypted and stored securely.',
    '',
    '💡 Now paste a token CA to create your first project, or return to Home.',
  ].join('\n')
}

export function buildWalletImportErrorText(reason: string): string {
  return [
    '❌ <b>IMPORT FAILED</b> ❌',
    '',
    reason,
    '',
    '📝 Please paste a valid Base58 private key, or cancel.',
  ].join('\n')
}

// ── New Project Screens ──────────────────────────────────────────────────

export function buildNewProjectCaInputText(): string {
  return [
    '➕ <b>NEW PROJECT</b> ➕',
    '',
    'Enter your token\'s contract address (CA) to create a new project.',
    '',
    '⚔️ <b>Supported Platforms:</b>',
    '• All Solana DEXes',
    '• All Launchpads',
    '',
    '📝 Paste your token CA below:',
  ].join('\n')
}

export function buildTokenFoundText(
  tokenName: string,
  tokenSymbol: string,
  dex: string,
  contractAddress: string,
): string {
  return [
    '🔮 <b>TOKEN FOUND</b> 🔮',
    '',
    `Name: <b>${escapeHtml(tokenName)}</b>`,
    `Symbol: <b>${escapeHtml(tokenSymbol)}</b>`,
    `DEX: <b>${escapeHtml(dex)}</b>`,
    `📋 CA: <code>${contractAddress}</code>`,
    '',
    'Confirm to create a project for this token?',
  ].join('\n')
}

export function buildTokenNotFoundText(): string {
  return [
    '❌ <b>TOKEN NOT FOUND</b> ❌',
    '',
    'The contract address could not be identified on any supported DEX.',
    '',
    '💡 Double-check the address and try again.',
    '',
    '📝 Paste a valid token CA below:',
  ].join('\n')
}

export function buildProjectLimitText(): string {
  return [
    '⚠️ <b>PROJECT LIMIT REACHED</b> ⚠️',
    '',
    'You already have the maximum of 3 projects.',
    '',
    '💡 Delete an existing project to create a new one.',
  ].join('\n')
}

export function buildProjectExistsText(tokenName: string): string {
  return [
    `👁️ You already have a project tracking <b>${escapeHtml(tokenName)}</b>.`,
    '',
    'Navigating to your project dashboard…',
  ].join('\n')
}

// ── Project Key Display ──────────────────────────────────────────────────

export function buildProjectKeyText(
  tokenName: string,
  contractAddress: string,
  publicKey: string,
  privateKey: string,
): string {
  return [
    '🗝️ <b>PROJECT WALLET</b> 🗝️',
    '',
    `Project: <b>${escapeHtml(tokenName)}</b>`,
    `📋 CA: <code>${contractAddress}</code>`,
    '',
    '⚠️ <b>CRITICAL — This key is shown ONLY ONCE</b> ⚠️',
    '',
    'Private Key:',
    `<tg-spoiler>${privateKey}</tg-spoiler>`,
    '',
    `📋 Public Key: <code>${publicKey}</code>`,
    '',
    '📋 Import this key into Phantom or Solflare to monitor this wallet.',
    '💀 This message self-destructs in 24 hours.',
    '',
    'After importing, tap "Acknowledged" below.',
  ].join('\n')
}

/**
 * Wallet-choice screen shown after the user confirms a token. Branches based
 * on whether the user already has any wallets.
 */
export function buildWalletChoiceText(
  tokenName: string,
  hasExistingWallets: boolean,
): string {
  const lines = [
    '🪙 <b>CHOOSE A WALLET</b> 🪙',
    '',
    `Project: <b>${escapeHtml(tokenName)}</b>`,
    '',
  ]
  if (hasExistingWallets) {
    lines.push(
      '🔗 <b>Link existing wallet</b> — reuse a wallet that already holds this token.',
      '🆕 <b>Create new wallet</b> — generate a fresh Solana wallet just for this project.',
    )
  }
  else {
    lines.push('You don\'t have any wallets yet — let\'s generate one for this project.')
  }
  return lines.join('\n')
}

/** Picker screen shown when 0 or >1 of the user's wallets hold the token. */
export function buildWalletPickerText(
  tokenName: string,
  anyHolders: boolean,
): string {
  const intro = anyHolders
    ? 'Multiple wallets hold this token — pick one to use:'
    : 'None of your wallets hold this token yet. Pick one anyway (you can fund it later):'
  return [
    '🪙 <b>PICK A WALLET</b> 🪙',
    '',
    `Project: <b>${escapeHtml(tokenName)}</b>`,
    '',
    intro,
  ].join('\n')
}

// ── My Projects Screen ───────────────────────────────────────────────────

export function buildMyProjectsText(projects: ProjectListItem[]): string {
  const lines = [
    '👁️ <b>MY PROJECTS</b> 👁️',
    '',
    `You have <b>${projects.length}</b> active project${projects.length === 1 ? '' : 's'}:`,
    '',
  ]

  for (const p of projects) {
    const emoji = STATUS_EMOJI[p.status] ?? '⏸️'
    const name = p.tokenSymbol
      ? escapeHtml(p.tokenSymbol)
      : p.tokenName
        ? escapeHtml(p.tokenName)
        : p.tokenMint.slice(0, 8)
    lines.push(`${emoji} <b>${name}</b> — ${p.status}`)
  }

  lines.push('', '💡 Tap a project to open its dashboard.')
  return lines.join('\n')
}

export function buildNoProjectsText(): string {
  return [
    '👁️ <b>MY PROJECTS</b> 👁️',
    '',
    'You don\'t have any projects yet.',
    '',
    '💡 Paste a token CA or tap ➕ New Project to get started.',
  ].join('\n')
}

// ── Dashboard Screen ─────────────────────────────────────────────────────

export interface DashboardData {
  tokenName: string
  tokenSymbol: string
  tokenMint: string
  dexUrl: string | null
  walletPublicKey: string
  status: string
  config: {
    minSellPercentage: number
    maxSellPercentage: number
    targetMarketCapUsd: number
    minBuyAmountSol: number
  }
  totalSellCount: number
  totalSolReceived: string
  totalSoldAmount: string
  whitelistCount: number
  lastMarketCapUsd: string | null
}

const DASHBOARD_STATUS: Record<string, string> = {
  idle: '🔴 Inactive',
  pending: '🟡 Waiting for MCAP target',
  watching: '🟢 Watching for buys',
  executing: '🔵 Executing sell...',
  completed: '✅ Completed',
  stopped: '⏹️ Stopped',
  error: '❌ Error',
}

export function buildDashboardText(d: DashboardData): string {
  const statusLine = DASHBOARD_STATUS[d.status] ?? d.status
  const mcap = d.lastMarketCapUsd ? `$${formatMcap(Number(d.lastMarketCapUsd))}` : '—'
  const targetMcap = d.config.targetMarketCapUsd === 0
    ? 'Disabled'
    : `$${formatMcap(d.config.targetMarketCapUsd)}`

  return [
    '⚔️ <b>PROJECT DASHBOARD</b> ⚔️',
    '',
    `<b>${escapeHtml(d.tokenName)}</b> — Control Panel`,
    '',
    '📋 Contract:',
    `<code>${d.tokenMint}</code>`,
    '',
    `💰 Market Cap: ${mcap}`,
    '',
    '💳 Deposit Address:',
    `<code>${d.walletPublicKey}</code>`,
    '',
    '━━━━━━━━━━━━━━━━━━━',
    '',
    `🌑 SHADOW SELL — ${statusLine}`,
    '',
    '⚙️ Config:',
    `📉 Min Sell: ${d.config.minSellPercentage}%`,
    `📈 Max Sell: ${d.config.maxSellPercentage}%`,
    `💰 Min MCAP: ${targetMcap}`,
    `💵 Min Buy: ${d.config.minBuyAmountSol} SOL`,
    `🛡️ Whitelist: ${d.whitelistCount}/25 wallets`,
    '',
    '📊 Stats:',
    `🗡️ Sells: ${d.totalSellCount}`,
    `💰 SOL Earned: ${Number(d.totalSolReceived).toFixed(4)}`,
    `🪙 Tokens Sold: ${Number(d.totalSoldAmount).toFixed(4)}`,
  ].join('\n')
}

// ── Config Screens ───────────────────────────────────────────────────────

export function buildConfigMinSellText(current: number): string {
  return [
    '📉 <b>SET MIN SELL PERCENTAGE</b>',
    '',
    `Current: <b>${current}%</b>`,
    '',
    'The minimum percentage of each detected buy that will be sold.',
    '',
    '📝 Select or type a value (1–100):',
  ].join('\n')
}

export function buildConfigMaxSellText(current: number, minSell: number): string {
  return [
    '📈 <b>SET MAX SELL PERCENTAGE</b>',
    '',
    `Current: <b>${current}%</b>`,
    '',
    'The maximum percentage of each detected buy that will be sold.',
    `Must be ≥ Min Sell (${minSell}%).`,
    '',
    `📝 Select or type a value (${minSell}–100):`,
  ].join('\n')
}

export function buildConfigMcapText(current: number): string {
  const display = current === 0 ? 'Disabled ($0)' : `$${formatMcap(current)}`
  return [
    '💰 <b>SET MINIMUM MARKET CAP</b>',
    '',
    `Current: <b>${display}</b>`,
    '',
    'Shadow Sell only activates when market cap is ABOVE this value.',
    'Set to $0 to start immediately (no threshold).',
    '',
    '📝 Select a target or type a custom value:',
  ].join('\n')
}

export function buildConfigMinBuyText(current: number): string {
  return [
    '💵 <b>SET MINIMUM BUY AMOUNT</b>',
    '',
    `Current: <b>${current} SOL</b>`,
    '',
    'Only buys ABOVE this amount (in SOL) will trigger a Shadow Sell.',
    'Smaller buys are ignored.',
    '',
    '📝 Select or type an amount in SOL:',
  ].join('\n')
}

export function buildConfigSavedText(field: string, value: string): string {
  return `✅ <b>${escapeHtml(field)}</b> updated to <b>${escapeHtml(value)}</b>.`
}

export function buildConfigLockedText(): string {
  return '🔒 Configuration is locked while Shadow Sell is active. Stop it first to change settings.'
}

// ── Whitelist Screen ─────────────────────────────────────────────────────

export interface WhitelistDisplayEntry {
  id: string
  walletAddress: string
}

export function buildWhitelistText(
  entries: WhitelistDisplayEntry[],
  total: number,
  page: number,
  totalPages: number,
): string {
  const lines = [
    '🛡️ <b>WHITELIST</b> 🛡️',
    '',
    'Whitelisted wallets will NOT trigger Shadow Sell.',
    '',
    `Total: <b>${total}/25</b>`,
  ]

  if (totalPages > 1) {
    lines.push(`Page ${page}/${totalPages}`)
  }

  lines.push('')

  if (entries.length === 0) {
    lines.push('No whitelisted wallets yet.')
  }
  else {
    for (let i = 0; i < entries.length; i++) {
      const addr = entries[i]!.walletAddress
      const truncated = `${addr.slice(0, 6)}…${addr.slice(-4)}`
      lines.push(`${(page - 1) * 5 + i + 1}. <code>${truncated}</code>`)
    }
  }

  return lines.join('\n')
}

export function buildAddWhitelistText(count: number): string {
  return [
    '➕ <b>ADD TO WHITELIST</b>',
    '',
    'Enter a Solana wallet address to protect from Shadow Sell triggers.',
    '',
    `Current: <b>${count}/25</b>`,
    '',
    '📝 Paste wallet address below:',
  ].join('\n')
}

// ── Delete Confirm Screen ────────────────────────────────────────────────

export function buildDeleteConfirmText(tokenName: string, isActive: boolean): string {
  const lines = [
    '⚠️ <b>DELETE PROJECT</b> ⚠️',
    '',
    `Are you sure you want to permanently delete <b>${escapeHtml(tokenName)}</b>?`,
  ]

  if (isActive) {
    lines.push(
      '',
      '⚡ <b>WARNING:</b> Shadow Sell is currently active and will be stopped immediately.',
    )
  }

  lines.push(
    '',
    'Double-check that no funds remain in the wallet before proceeding.',
  )

  return lines.join('\n')
}

// ── Referrals Screen ─────────────────────────────────────────────────────

export interface ReferralDisplayData {
  tier1Count: number
  tier2Count: number
  totalEarned: string
  pendingPayout: string
  payoutWallet: string | null
  referralLink: string
}

export function buildReferralsText(d: ReferralDisplayData): string {
  const walletLine = d.payoutWallet
    ? `<code>${d.payoutWallet.slice(0, 6)}…${d.payoutWallet.slice(-4)}</code>`
    : '❌ Not Set'

  return [
    '🎁 <b>REFERRALS</b> 🎁',
    '',
    'Invite Friends — Earn While They Trade.',
    '',
    '💰 Rewards:',
    '• Tier 1: 35% of your direct referrals\' fees',
    '• Tier 2: 5% of their referrals\' fees',
    '• Referred soldiers get 10% fee discount',
    '',
    '📊 Your Stats:',
    `👥 Tier 1 Recruits: ${d.tier1Count}`,
    `👥 Tier 2 Recruits: ${d.tier2Count}`,
    `💰 Total Earned: ${Number(d.totalEarned).toFixed(4)} SOL`,
    `🎁 Available: ${Number(d.pendingPayout).toFixed(4)} SOL`,
    '',
    `💳 Payout Wallet: ${walletLine}`,
    '',
    '🔗 Your Link:',
    `<code>${d.referralLink}</code>`,
    '',
    '💎 Share and grow your network.',
  ].join('\n')
}

export function buildSetPayoutWalletText(): string {
  return [
    '💳 <b>SET PAYOUT WALLET</b>',
    '',
    'Enter the Solana wallet address where you want to receive referral payouts.',
    '',
    '📝 Paste your wallet address below:',
  ].join('\n')
}

// ── Wallets Screen ───────────────────────────────────────────────────────

export interface WalletDisplayItem {
  publicKey: string
  /** Token names of every active project using this wallet (may be empty). */
  projectNames: string[]
}

export function buildWalletsText(wallets: WalletDisplayItem[]): string {
  const lines = [
    '💼 <b>WALLETS</b> 💼',
    '',
    'Your imported wallets:',
    '',
  ]

  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i]!
    const addr = `${w.publicKey.slice(0, 6)}…${w.publicKey.slice(-4)}`
    const status = w.projectNames.length > 0
      ? `Used by: ${w.projectNames.map(n => escapeHtml(n)).join(', ')}`
      : 'Unused'
    lines.push(`${i + 1}. <code>${addr}</code> — ${status}`)
  }

  lines.push('', '💡 Tap ⚡ Import Wallet below to add more.')
  return lines.join('\n')
}

export function buildNoWalletsText(): string {
  return [
    '💼 <b>WALLETS</b> 💼',
    '',
    '⚠️ You haven\'t imported any wallets yet.',
    '',
    'Tap ⚡ Import Wallet below to get started.',
  ].join('\n')
}

// ── Pinned Status Message ────────────────────────────────────────────────

export interface PinnedStatusData {
  tokenName: string
  tokenSymbol: string
  tokenMint: string
  config: {
    minSellPercentage: number
    maxSellPercentage: number
    targetMarketCapUsd: number
    minBuyAmountSol: number
  }
  totalSellCount: number
  totalSolReceived: string
  totalSoldAmount: string
  state: 'watching' | 'stopped'
}

export function buildPinnedStatusText(d: PinnedStatusData): string {
  const mcap = d.config.targetMarketCapUsd === 0
    ? '$0'
    : `$${formatMcap(d.config.targetMarketCapUsd)}`

  if (d.state === 'stopped') {
    return [
      '🌑 SHADOW SELL — ⏹️ STOPPED',
      '',
      `${escapeHtml(d.tokenName)} (${escapeHtml(d.tokenSymbol)})`,
      '',
      `📊 Stats: 🗡️ ${d.totalSellCount} | 💰 ${Number(d.totalSolReceived).toFixed(4)} SOL | 🪙 ${Number(d.totalSoldAmount).toFixed(4)}`,
      '',
      'Stopped by user.',
    ].join('\n')
  }

  return [
    '🌑 SHADOW SELL — ACTIVE ⚡',
    '',
    `${escapeHtml(d.tokenName)} (${escapeHtml(d.tokenSymbol)})`,
    `📋 <code>${d.tokenMint}</code>`,
    '',
    '📊 Session Stats:',
    `🗡️ Sells: ${d.totalSellCount}`,
    `💰 SOL Earned: ${Number(d.totalSolReceived).toFixed(4)}`,
    `🪙 Tokens Sold: ${Number(d.totalSoldAmount).toFixed(4)}`,
    '',
    `⚙️ Min/Max: ${d.config.minSellPercentage}-${d.config.maxSellPercentage}% | MCAP: ${mcap} | Buy: ${d.config.minBuyAmountSol}`,
    '',
    '⏳ Watching for buys...',
  ].join('\n')
}

// ── Utility ──────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function formatMcap(value: number): string {
  if (value >= 1_000_000_000_000)
    return `${(value / 1_000_000_000_000).toFixed(1)}T`
  if (value >= 1_000_000_000)
    return `${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000)
    return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000)
    return `${Math.round(value / 1_000)}K`
  return String(value)
}

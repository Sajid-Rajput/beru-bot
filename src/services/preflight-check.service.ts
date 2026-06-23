import type { SolanaRpcService } from '#root/services/solana-rpc.service.js'

export type PreflightBlockReason = 'no_sol' | 'no_token'

export type PreflightResult =
  | { ok: true, solBalance: number, tokenBalance: number }
  | { ok: false, reason: PreflightBlockReason, message: string }

/**
 * Pre-flight balance policy for Start Shadow Sell (#18).
 *
 * Deep module: the only public seam is {@link checkStartBalances}. It owns the
 * "a zero balance blocks the start" policy, the order the balances are checked,
 * and the user-facing copy — so the grammY handler stays a thin wiring layer.
 */
export class PreflightCheckService {
  constructor(private readonly rpc: SolanaRpcService) {}

  async checkStartBalances(wallet: string, mint: string): Promise<PreflightResult> {
    const solBalance = await this.rpc.getSolBalance(wallet)
    if (solBalance <= 0) {
      return {
        ok: false,
        reason: 'no_sol',
        message: 'Project wallet has no SOL — fund it before starting Shadow Sell',
      }
    }

    // Throwing variant on purpose: a read failure must propagate (handled by the
    // caller as a transient error), never be misread as a genuine zero balance.
    const tokenBalance = await this.rpc.getTokenBalanceOrThrow(wallet, mint)
    if (tokenBalance <= 0) {
      return {
        ok: false,
        reason: 'no_token',
        message: 'Project wallet holds none of this token — acquire some before starting Shadow Sell',
      }
    }

    return { ok: true, solBalance, tokenBalance }
  }
}

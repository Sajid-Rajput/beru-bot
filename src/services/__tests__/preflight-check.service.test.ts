import type { SolanaRpcService } from '../solana-rpc.service.js'
import { describe, expect, it } from 'vitest'
import { PreflightCheckService } from '../preflight-check.service.js'

// Real-shaped base58 strings; never used against a live RPC.
const WALLET = 'So11111111111111111111111111111111111111112'
const MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

/** Minimal SolanaRpcService stub — the policy only reads these two balances. */
function fakeRpc(solBalance: number, tokenBalance: number): SolanaRpcService {
  return {
    getSolBalance: async () => solBalance,
    getTokenBalanceOrThrow: async () => tokenBalance,
  } as unknown as SolanaRpcService
}

describe('preflightCheckService.checkStartBalances', () => {
  it('blocks the start when the project wallet has no SOL', async () => {
    const service = new PreflightCheckService(fakeRpc(0, 1000))

    const result = await service.checkStartBalances(WALLET, MINT)

    expect(result).toEqual({
      ok: false,
      reason: 'no_sol',
      message: 'Project wallet has no SOL — fund it before starting Shadow Sell',
    })
  })

  it('blocks the start when the wallet holds none of the token', async () => {
    const service = new PreflightCheckService(fakeRpc(1.5, 0))

    const result = await service.checkStartBalances(WALLET, MINT)

    expect(result).toEqual({
      ok: false,
      reason: 'no_token',
      message: 'Project wallet holds none of this token — acquire some before starting Shadow Sell',
    })
  })

  it('allows the start and reports both balances when the wallet is funded', async () => {
    const service = new PreflightCheckService(fakeRpc(1.5, 1000))

    const result = await service.checkStartBalances(WALLET, MINT)

    expect(result).toEqual({ ok: true, solBalance: 1.5, tokenBalance: 1000 })
  })

  it('reports no_sol first when both SOL and the token are empty', async () => {
    const service = new PreflightCheckService(fakeRpc(0, 0))

    const result = await service.checkStartBalances(WALLET, MINT)

    expect(result).toMatchObject({ ok: false, reason: 'no_sol' })
  })

  it('propagates the error when the token balance cannot be read (no false no_token block)', async () => {
    const rpc = {
      getSolBalance: async () => 1.5,
      getTokenBalanceOrThrow: async () => {
        throw new Error('both RPCs down')
      },
    } as unknown as SolanaRpcService
    const service = new PreflightCheckService(rpc)

    await expect(service.checkStartBalances(WALLET, MINT)).rejects.toThrow('both RPCs down')
  })
})

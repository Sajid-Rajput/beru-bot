import { ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { Connection, Keypair, SystemProgram, Transaction } from '@solana/web3.js'
import { describe, expect, it, vi } from 'vitest'
import { SolanaRpcService } from '../solana-rpc.service.js'
import {
  buildCombinedFundingTx,
  buildSweepAndFeeTx,
  calculateSellAmount,
  sendAndConfirmTransaction,
} from '../solana-tx.service.js'

function stubConnection(): Connection {
  return Object.create(Connection.prototype) as Connection
}

describe('calculateSellAmount', () => {
  it('returns the lower bound (floor(balance * minPct / 100)) when rng yields 0', () => {
    // balance=1_000, minPct=10, maxPct=50 → low=100, high=500
    expect(calculateSellAmount(1_000, 10, 50, () => 0)).toBe(100)
  })

  it('returns the upper bound when rng yields just-below-1', () => {
    // rng → 0.9999… → Math.floor(0.9999 * 401) = 400 → 100 + 400 = 500
    expect(calculateSellAmount(1_000, 10, 50, () => 1 - Number.EPSILON)).toBe(500)
  })

  it('collapses to exactly floor(balance * pct / 100) when minPct == maxPct', () => {
    // balance=999, pct=25 → floor(999*25/100) = 249, regardless of rng
    expect(calculateSellAmount(999, 25, 25, () => 0)).toBe(249)
    expect(calculateSellAmount(999, 25, 25, () => 0.5)).toBe(249)
    expect(calculateSellAmount(999, 25, 25, () => 1 - Number.EPSILON)).toBe(249)
  })

  it('returns an integer for every rng value in [0, 1)', () => {
    for (const r of [0, 0.01, 0.25, 0.5, 0.73, 0.99, 1 - Number.EPSILON]) {
      const result = calculateSellAmount(12_345, 7, 41, () => r)
      expect(Number.isInteger(result)).toBe(true)
    }
  })

  it('stays within [low, high] inclusive across the full rng range', () => {
    const balance = 1_000_000
    const minPct = 13
    const maxPct = 87
    const low = Math.floor(balance * minPct / 100)
    const high = Math.floor(balance * maxPct / 100)
    for (let i = 0; i < 200; i++) {
      const r = i / 200
      const v = calculateSellAmount(balance, minPct, maxPct, () => r)
      expect(v).toBeGreaterThanOrEqual(low)
      expect(v).toBeLessThanOrEqual(high)
    }
  })
})

describe('buildSweepAndFeeTx', () => {
  const ephemeral = Keypair.generate().publicKey
  const main = Keypair.generate().publicKey
  const platformFee = Keypair.generate().publicKey

  it('returns a Transaction with exactly two SystemProgram.transfer instructions', () => {
    const tx = buildSweepAndFeeTx(ephemeral, main, platformFee, 1_000_000, 10_000)

    expect(tx).toBeInstanceOf(Transaction)
    expect(tx.instructions).toHaveLength(2)
    for (const ix of tx.instructions)
      expect(ix.programId.equals(SystemProgram.programId)).toBe(true)
  })

  it('uses the ephemeral wallet as fee payer (it is the only signer)', () => {
    const tx = buildSweepAndFeeTx(ephemeral, main, platformFee, 1_000_000, 10_000)
    expect(tx.feePayer?.equals(ephemeral)).toBe(true)
  })

  it('emits ephemeral→main sweep first, then ephemeral→platform fee, with the given lamports', () => {
    const sweep = 1_982_000_000 // 1.982 SOL example from ARCHITECTURE §9.2
    const fee = 18_000_000 // 0.018 SOL
    const tx = buildSweepAndFeeTx(ephemeral, main, platformFee, sweep, fee)

    // SystemProgram.transfer layout: keys[0] = from, keys[1] = to. Both signer-from on ephemeral.
    const [sweepIx, feeIx] = tx.instructions
    expect(sweepIx.keys[0].pubkey.equals(ephemeral)).toBe(true)
    expect(sweepIx.keys[1].pubkey.equals(main)).toBe(true)
    expect(feeIx.keys[0].pubkey.equals(ephemeral)).toBe(true)
    expect(feeIx.keys[1].pubkey.equals(platformFee)).toBe(true)

    // Decode lamports from the instruction data: u32 instruction discriminator (2 = Transfer) + u64 lamports LE
    const sweepLamports = sweepIx.data.readBigUInt64LE(4)
    const feeLamports = feeIx.data.readBigUInt64LE(4)
    expect(sweepLamports).toBe(BigInt(sweep))
    expect(feeLamports).toBe(BigInt(fee))
  })
})

describe('buildCombinedFundingTx', () => {
  const mainWallet = Keypair.generate().publicKey
  const ephemeralWallet = Keypair.generate().publicKey
  const tokenMint = Keypair.generate().publicKey
  const tokenAmount = 1_000_000n // base units
  const solAmount = 5_000_000 // lamports (0.005 SOL)

  it('returns a Transaction carrying an SPL token transfer and a SOL transfer', () => {
    const tx = buildCombinedFundingTx(mainWallet, ephemeralWallet, tokenMint, tokenAmount, solAmount)

    expect(tx).toBeInstanceOf(Transaction)
    const splTransfers = tx.instructions.filter(ix => ix.programId.equals(TOKEN_PROGRAM_ID))
    const solTransfers = tx.instructions.filter(ix => ix.programId.equals(SystemProgram.programId))
    expect(splTransfers).toHaveLength(1)
    expect(solTransfers).toHaveLength(1)
  })

  it('uses the main wallet as fee payer', () => {
    const tx = buildCombinedFundingTx(mainWallet, ephemeralWallet, tokenMint, tokenAmount, solAmount)
    expect(tx.feePayer?.equals(mainWallet)).toBe(true)
  })

  it('includes an idempotent ATA-create for the ephemeral destination', () => {
    const tx = buildCombinedFundingTx(mainWallet, ephemeralWallet, tokenMint, tokenAmount, solAmount)
    const ataIx = tx.instructions.find(ix => ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID))
    expect(ataIx).toBeDefined()
    // Idempotent ATA-create discriminator is byte 0x01; create is 0x00.
    expect(ataIx?.data[0]).toBe(1)
  })

  it('routes the SPL transfer from main\'s ATA to ephemeral\'s ATA, signed by main, for tokenAmount base units', () => {
    const tx = buildCombinedFundingTx(mainWallet, ephemeralWallet, tokenMint, tokenAmount, solAmount)
    const splIx = tx.instructions.find(ix => ix.programId.equals(TOKEN_PROGRAM_ID))!

    const expectedSourceAta = getAssociatedTokenAddressSync(tokenMint, mainWallet)
    const expectedDestAta = getAssociatedTokenAddressSync(tokenMint, ephemeralWallet)

    // SPL Transfer (non-checked) key order: [source, destination, owner]
    expect(splIx.keys[0].pubkey.equals(expectedSourceAta)).toBe(true)
    expect(splIx.keys[1].pubkey.equals(expectedDestAta)).toBe(true)
    expect(splIx.keys[2].pubkey.equals(mainWallet)).toBe(true)
    expect(splIx.keys[2].isSigner).toBe(true)

    // Transfer instruction layout: u8 discriminator (3 = Transfer) + u64 amount LE
    expect(splIx.data[0]).toBe(3)
    expect(splIx.data.readBigUInt64LE(1)).toBe(tokenAmount)
  })

  it('routes the SOL transfer from main → ephemeral for solAmount lamports', () => {
    const tx = buildCombinedFundingTx(mainWallet, ephemeralWallet, tokenMint, tokenAmount, solAmount)
    const solIx = tx.instructions.find(ix => ix.programId.equals(SystemProgram.programId))!

    expect(solIx.keys[0].pubkey.equals(mainWallet)).toBe(true)
    expect(solIx.keys[1].pubkey.equals(ephemeralWallet)).toBe(true)
    expect(solIx.data.readBigUInt64LE(4)).toBe(BigInt(solAmount))
  })
})

describe('sendAndConfirmTransaction', () => {
  const BLOCKHASH = '4NCYB3kRT8sCNodPNuCZo8VUh4ggGfeRQAJgWyJSiR1m'
  const LAST_VALID_BLOCK_HEIGHT = 1234

  function stubRpc() {
    const primary = stubConnection()
    const fallback = stubConnection()
    ;(primary as unknown as { getLatestBlockhash: unknown }).getLatestBlockhash
      = vi.fn().mockResolvedValue({ blockhash: BLOCKHASH, lastValidBlockHeight: LAST_VALID_BLOCK_HEIGHT })
    ;(primary as unknown as { sendRawTransaction: unknown }).sendRawTransaction
      = vi.fn().mockResolvedValue('sig-primary')
    ;(primary as unknown as { confirmTransaction: unknown }).confirmTransaction
      = vi.fn().mockResolvedValue({ value: { err: null } })
    return { rpc: new SolanaRpcService({ primary, fallback }), primary, fallback }
  }

  it('returns the signature reported by the primary connection', async () => {
    const { rpc } = stubRpc()
    const payer = Keypair.generate()
    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1 }),
    )
    tx.feePayer = payer.publicKey

    await expect(sendAndConfirmTransaction(rpc, tx, [payer])).resolves.toBe('sig-primary')
  })

  it('confirms with the \'confirmed\' commitment level (ADR #5)', async () => {
    const { rpc, primary } = stubRpc()
    const payer = Keypair.generate()
    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1 }),
    )
    tx.feePayer = payer.publicKey

    await sendAndConfirmTransaction(rpc, tx, [payer])

    const confirm = (primary as unknown as { confirmTransaction: ReturnType<typeof vi.fn> }).confirmTransaction
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm.mock.calls[0][1]).toBe('confirmed')
    const getBlockhash = (primary as unknown as { getLatestBlockhash: ReturnType<typeof vi.fn> }).getLatestBlockhash
    expect(getBlockhash.mock.calls[0][0]).toBe('confirmed')
  })

  it('does not touch the fallback connection (writes stay on primary)', async () => {
    const { rpc, fallback } = stubRpc()
    // Fail loudly if anything calls into the fallback.
    ;(fallback as unknown as { getLatestBlockhash: unknown }).getLatestBlockhash
      = vi.fn().mockRejectedValue(new Error('fallback must not be used for writes'))
    ;(fallback as unknown as { sendRawTransaction: unknown }).sendRawTransaction
      = vi.fn().mockRejectedValue(new Error('fallback must not be used for writes'))

    const payer = Keypair.generate()
    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1 }),
    )
    tx.feePayer = payer.publicKey

    await expect(sendAndConfirmTransaction(rpc, tx, [payer])).resolves.toBe('sig-primary')
    expect((fallback as unknown as { getLatestBlockhash: ReturnType<typeof vi.fn> }).getLatestBlockhash).not.toHaveBeenCalled()
    expect((fallback as unknown as { sendRawTransaction: ReturnType<typeof vi.fn> }).sendRawTransaction).not.toHaveBeenCalled()
  })

  it('propagates send errors from the primary connection', async () => {
    const { rpc, primary } = stubRpc()
    const sendErr = new Error('send rejected: blockhash not found')
    ;(primary as unknown as { sendRawTransaction: unknown }).sendRawTransaction
      = vi.fn().mockRejectedValue(sendErr)

    const payer = Keypair.generate()
    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1 }),
    )
    tx.feePayer = payer.publicKey

    await expect(sendAndConfirmTransaction(rpc, tx, [payer])).rejects.toBe(sendErr)
  })
})

/**
 * Devnet smoke check for src/services/solana-tx.service.ts (issue #19).
 *
 * Flow:
 *   1. Broadcast a small setup TX that wraps a bit of SOL on the main wallet
 *      (so it has a real WSOL ATA with a balance) and funds the throwaway
 *      ephemeral wallet (so it has a real on-chain account that can pay fees).
 *   2. Build each TX with realistic inputs.
 *   3. Round-trip through Transaction.serialize → Transaction.from to confirm
 *      "deserializable".
 *   4. connection.simulateTransaction(...) to confirm "simulatable" end-to-end:
 *      with proper on-chain state staged, both builders should simulate cleanly
 *      (err = null).
 *
 * Run:
 *   MAIN_WALLET_SECRET_KEY=<bs58-key> pnpm tsx scripts/smoke-solana-tx.ts
 *
 * Optional env:
 *   DEVNET_RPC_URL          — override (default https://api.devnet.solana.com)
 *   MAIN_WALLET_SECRET_KEY  — base58-encoded 64-byte secret. Required to run the
 *                             setup TX. If omitted, the script falls back to a
 *                             throwaway keypair and only checks deserializability.
 */

import process from 'node:process'
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
} from '@solana/spl-token'
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from '@solana/web3.js'
import bs58 from 'bs58'
import {
  buildCombinedFundingTx,
  buildSweepAndFeeTx,
  calculateSellAmount,
} from '../src/services/solana-tx.service.js'

const DEVNET_URL = process.env.DEVNET_RPC_URL ?? 'https://api.devnet.solana.com'

// Smoke amounts — small enough that one funded main wallet can run this many times.
const WRAP_LAMPORTS = 1_000_000 // 0.001 SOL wrapped into main's WSOL ATA
// Ephemeral must end the sweep above rent-exempt min (~890_880) — Solana errors
// otherwise. Prime with enough to cover both sweep transfers + fees + headroom.
const EPHEMERAL_PRIME_LAMPORTS = 3_000_000 // 0.003 SOL
const TOKEN_AMOUNT_BASE_UNITS = 100_000n // base units of wSOL transferred in funding sim
const FUNDING_SOL_LAMPORTS = 100_000 // gas lamports transferred in funding sim
// Destinations created by the sweep TX must receive ≥ rent-exempt min (~890_880).
const SWEEP_USER_LAMPORTS = 1_000_000 // ephemeral → main in sweep sim
const SWEEP_FEE_LAMPORTS = 1_000_000 // ephemeral → platformFee (fresh account)

function loadMainWallet(): { wallet: Keypair, real: boolean } {
  const secret = process.env.MAIN_WALLET_SECRET_KEY
  if (!secret) {
    console.log('No MAIN_WALLET_SECRET_KEY provided — using throwaway keypair (skips setup TX).')
    return { wallet: Keypair.generate(), real: false }
  }
  const decoded = bs58.decode(secret)
  if (decoded.length !== 64)
    throw new Error(`MAIN_WALLET_SECRET_KEY decoded to ${decoded.length} bytes, expected 64`)
  return { wallet: Keypair.fromSecretKey(decoded), real: true }
}

function assertRoundTrip(tx: Transaction, label: string): void {
  const bytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false })
  const restored = Transaction.from(bytes)
  if (restored.instructions.length !== tx.instructions.length) {
    throw new Error(`${label}: round-trip lost instructions (${tx.instructions.length} → ${restored.instructions.length})`)
  }
  console.log(`✓ ${label} round-trips (${bytes.length} bytes, ${tx.instructions.length} ixs)`)
}

async function simulate(connection: Connection, tx: Transaction, label: string): Promise<void> {
  // Legacy Transaction overload: simulateTransaction(tx, signers?, includeAccounts?).
  // We've already signed `tx` with the right keypair before calling, so signatures verify.
  const res = await connection.simulateTransaction(tx)
  const ok = res.value.err === null || res.value.err === undefined
  const tag = ok ? '✓' : '✗'
  console.log(`${tag} ${label} simulated: err=${JSON.stringify(res.value.err)}`)
  if (res.value.logs?.length) {
    console.log('  logs:')
    for (const line of res.value.logs.slice(0, 12))
      console.log(`    ${line}`)
    if (res.value.logs.length > 12)
      console.log(`    … (${res.value.logs.length - 12} more)`)
  }
  if (!ok)
    throw new Error(`${label}: simulation reported err=${JSON.stringify(res.value.err)}`)
}

async function stageOnChainState(
  connection: Connection,
  mainWallet: Keypair,
  ephemeralWallet: Keypair,
): Promise<void> {
  const mainWsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, mainWallet.publicKey)

  // Skip wrap if the ATA already exists with enough balance (re-running the script).
  let needsWrap = true
  try {
    const info = await connection.getTokenAccountBalance(mainWsolAta, 'confirmed')
    if (Number(info.value.amount) >= Number(TOKEN_AMOUNT_BASE_UNITS))
      needsWrap = false
  }
  catch {
    needsWrap = true
  }

  const setup = new Transaction()
  setup.feePayer = mainWallet.publicKey

  if (needsWrap) {
    console.log(`  staging: wrapping ${WRAP_LAMPORTS} lamports into ${mainWsolAta.toBase58()}`)
    setup.add(
      createAssociatedTokenAccountIdempotentInstruction(
        mainWallet.publicKey,
        mainWsolAta,
        mainWallet.publicKey,
        NATIVE_MINT,
      ),
      SystemProgram.transfer({
        fromPubkey: mainWallet.publicKey,
        toPubkey: mainWsolAta,
        lamports: WRAP_LAMPORTS,
      }),
      createSyncNativeInstruction(mainWsolAta),
    )
  }
  else {
    console.log(`  staging: WSOL ATA already funded (skip wrap)`)
  }

  console.log(`  staging: priming ephemeral ${ephemeralWallet.publicKey.toBase58()} with ${EPHEMERAL_PRIME_LAMPORTS} lamports`)
  setup.add(
    SystemProgram.transfer({
      fromPubkey: mainWallet.publicKey,
      toPubkey: ephemeralWallet.publicKey,
      lamports: EPHEMERAL_PRIME_LAMPORTS,
    }),
  )

  const sig = await sendAndConfirmTransaction(connection, setup, [mainWallet], {
    commitment: 'confirmed',
  })
  console.log(`✓ setup TX confirmed: ${sig}`)
}

async function main(): Promise<void> {
  const connection = new Connection(DEVNET_URL, 'confirmed')

  console.log('--- calculateSellAmount ---')
  for (let i = 0; i < 3; i++)
    console.log(`  sample: balance=1_000_000_000 minPct=20 maxPct=40 → ${calculateSellAmount(1_000_000_000, 20, 40)}`)

  const { wallet: mainWallet, real } = loadMainWallet()
  const ephemeralWallet = Keypair.generate()
  const platformFeeWallet = Keypair.generate()
  const tokenMint = new PublicKey(NATIVE_MINT.toBase58())

  console.log(`\nmainWallet pubkey:      ${mainWallet.publicKey.toBase58()}`)
  console.log(`ephemeralWallet pubkey: ${ephemeralWallet.publicKey.toBase58()}`)

  const solBalance = await connection.getBalance(mainWallet.publicKey, 'confirmed')
  console.log(`mainWallet SOL balance: ${solBalance / 1e9} SOL`)

  if (real) {
    console.log('\n--- staging on-chain state ---')
    await stageOnChainState(connection, mainWallet, ephemeralWallet)
  }
  else {
    console.log('\n(skipping on-chain staging — running with throwaway wallet)')
  }

  const { blockhash } = await connection.getLatestBlockhash('confirmed')

  console.log('\n--- buildCombinedFundingTx ---')
  const fundingTx = buildCombinedFundingTx(
    mainWallet.publicKey,
    ephemeralWallet.publicKey,
    tokenMint,
    TOKEN_AMOUNT_BASE_UNITS,
    FUNDING_SOL_LAMPORTS,
  )
  fundingTx.recentBlockhash = blockhash
  fundingTx.sign(mainWallet)
  assertRoundTrip(fundingTx, 'buildCombinedFundingTx')
  await simulate(connection, fundingTx, 'buildCombinedFundingTx')

  console.log('\n--- buildSweepAndFeeTx ---')
  const sweepTx = buildSweepAndFeeTx(
    ephemeralWallet.publicKey,
    mainWallet.publicKey,
    platformFeeWallet.publicKey,
    SWEEP_USER_LAMPORTS,
    SWEEP_FEE_LAMPORTS,
  )
  sweepTx.recentBlockhash = blockhash
  sweepTx.sign(ephemeralWallet)
  assertRoundTrip(sweepTx, 'buildSweepAndFeeTx')
  await simulate(connection, sweepTx, 'buildSweepAndFeeTx')

  console.log('\nAll smoke checks passed.')
}

main().catch((err: unknown) => {
  console.error('Smoke check failed:', err)
  process.exit(1)
})

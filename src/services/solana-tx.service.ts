import type { Keypair, PublicKey } from '@solana/web3.js'
import type { SolanaRpcService } from './solana-rpc.service.js'
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import { SystemProgram, Transaction } from '@solana/web3.js'

/**
 * Sign, submit, and confirm a transaction against the primary RPC connection.
 * Writes do not failover (per PRD / ADR #5 — `confirmed` commitment, primary only).
 * Returns the on-chain signature on success.
 */
export async function sendAndConfirmTransaction(
  rpc: SolanaRpcService,
  tx: Transaction,
  signers: Keypair[],
): Promise<string> {
  const connection = rpc.primaryConnection
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
  tx.recentBlockhash = blockhash
  tx.sign(...signers)

  const signature = await connection.sendRawTransaction(tx.serialize())
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    'confirmed',
  )
  return signature
}

/**
 * Combined funding TX (ARCHITECTURE §6.6 / §7.2 step 7): a single transaction
 * that transfers the sell amount of an SPL token AND the SOL needed for gas +
 * Jupiter swap from the main wallet to the Ephemeral Wallet, atomically.
 *
 * `tokenAmount` is in base units (bigint). `solAmount` is in lamports (number).
 * Includes an idempotent ATA-create for the ephemeral side so first-time
 * recipients are handled in the same TX.
 */
export function buildCombinedFundingTx(
  mainWallet: PublicKey,
  ephemeralWallet: PublicKey,
  tokenMint: PublicKey,
  tokenAmount: bigint,
  solAmount: number,
): Transaction {
  const sourceAta = getAssociatedTokenAddressSync(tokenMint, mainWallet)
  const destAta = getAssociatedTokenAddressSync(tokenMint, ephemeralWallet)

  const tx = new Transaction()
  tx.feePayer = mainWallet
  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      mainWallet,
      destAta,
      ephemeralWallet,
      tokenMint,
    ),
    createTransferInstruction(sourceAta, destAta, mainWallet, tokenAmount),
    SystemProgram.transfer({
      fromPubkey: mainWallet,
      toPubkey: ephemeralWallet,
      lamports: solAmount,
    }),
  )
  return tx
}

/**
 * Sweep remaining SOL from the Ephemeral Wallet back to the user's main wallet
 * AND pay the platform fee in a single atomic transaction (invariant 18).
 *
 * `swapProceedsSol` and `feeSol` are in lamports (integer units).
 */
export function buildSweepAndFeeTx(
  ephemeralWallet: PublicKey,
  mainWallet: PublicKey,
  platformFeeWallet: PublicKey,
  swapProceedsSol: number,
  feeSol: number,
): Transaction {
  const tx = new Transaction()
  tx.feePayer = ephemeralWallet
  tx.add(
    SystemProgram.transfer({
      fromPubkey: ephemeralWallet,
      toPubkey: mainWallet,
      lamports: swapProceedsSol,
    }),
    SystemProgram.transfer({
      fromPubkey: ephemeralWallet,
      toPubkey: platformFeeWallet,
      lamports: feeSol,
    }),
  )
  return tx
}

export function calculateSellAmount(
  balance: number,
  minPct: number,
  maxPct: number,
  rng: () => number = Math.random,
): number {
  const low = Math.floor((balance * minPct) / 100)
  const high = Math.floor((balance * maxPct) / 100)
  return low + Math.floor(rng() * (high - low + 1))
}

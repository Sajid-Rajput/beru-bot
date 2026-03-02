import type { WalletRecord } from '#root/db/repositories/wallet.repository.js'

import { Buffer } from 'node:buffer'

import { config } from '#root/config.js'

import { AuditLogRepository } from '#root/db/repositories/audit-log.repository.js'
import { WalletRepository } from '#root/db/repositories/wallet.repository.js'
import { WalletError } from '#root/utils/errors.js'
import { createLogger } from '#root/utils/logger.js'
import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import { CryptoService } from './crypto.service.js'

const bs58Decode = (s: string) => bs58.decode(s)
const bs58Encode = (b: Uint8Array) => bs58.encode(b)

export type { WalletRecord }

const log = createLogger('WalletService')

/**
 * WalletService — manages Solana wallet lifecycle.
 * All private keys are always encrypted via CryptoService before DB storage
 * and zeroed from memory immediately after use (invariants 2, 4).
 */
export class WalletService {
  private readonly crypto: CryptoService
  private readonly walletRepo: WalletRepository
  private readonly auditRepo: AuditLogRepository

  constructor() {
    this.crypto = new CryptoService(config.masterKeySecret)
    this.walletRepo = new WalletRepository()
    this.auditRepo = new AuditLogRepository()
  }

  /**
   * Generates a fresh Solana keypair, encrypts the private key with the 2-layer
   * envelope scheme, and persists it to the DB.
   *
   * The plaintext key is zeroed from memory immediately after encryption.
   */
  async generateWallet(userId: string): Promise<WalletRecord> {
    const keypair = Keypair.generate()
    const publicKey = keypair.publicKey.toBase58()
    // secretKey is a 64-byte Uint8Array: [private(32) | public(32)]
    const privateKeyBase58 = bs58Encode(keypair.secretKey)
    let privateKeyBuf: Buffer | null = null

    try {
      privateKeyBuf = Buffer.from(keypair.secretKey) // copy for zeroing
      const payload = this.crypto.encryptPrivateKey(privateKeyBase58)
      const wallet = await this.walletRepo.create({
        userId,
        publicKey,
        encryptedPrivateKey: payload.encryptedPrivateKey,
        pkIv: payload.pkIv,
        pkAuthTag: payload.pkAuthTag,
        dekEncrypted: payload.dekEncrypted,
        dekIv: payload.dekIv,
        dekAuthTag: payload.dekAuthTag,
        dekSalt: payload.dekSalt,
        source: 'generated',
        isAssigned: false,
        assignedProjectId: null,
      })
      log.info({ userId, walletId: wallet.id, publicKey }, 'Wallet generated')
      return wallet
    }
    finally {
      // Inv 2: zero the private key from memory
      privateKeyBuf?.fill(0)
      keypair.secretKey.fill(0)
    }
  }

  /**
   * Imports an existing base58-encoded Solana private key.
   * Validates the key, derives the public key, rejects duplicates,
   * encrypts, and persists.
   *
   * The caller's input buffer is zeroed in the finally block.
   *
   * @throws {WalletError} for invalid key format, invalid keypair, or duplicate
   */
  async importWallet(userId: string, privateKeyBase58: string): Promise<WalletRecord> {
    let secretKeyBuf: Uint8Array | null = null

    try {
      // Decode and validate the key
      let decoded: Uint8Array
      try {
        decoded = bs58Decode(privateKeyBase58)
      }
      catch {
        throw new WalletError('Invalid private key: not valid base58')
      }

      if (decoded.length !== 64) {
        throw new WalletError(
          `Invalid private key: expected 64 bytes, got ${decoded.length}`,
        )
      }

      secretKeyBuf = decoded

      let keypair: Keypair
      try {
        keypair = Keypair.fromSecretKey(secretKeyBuf)
      }
      catch {
        throw new WalletError('Invalid private key: could not derive keypair')
      }

      const publicKey = keypair.publicKey.toBase58()

      // Check for duplicates
      const existing = await this.walletRepo.findByPublicKey(publicKey)
      if (existing) {
        throw new WalletError(
          'This wallet is already imported',
          'WALLET_DUPLICATE',
        )
      }

      const payload = this.crypto.encryptPrivateKey(privateKeyBase58)
      const wallet = await this.walletRepo.create({
        userId,
        publicKey,
        encryptedPrivateKey: payload.encryptedPrivateKey,
        pkIv: payload.pkIv,
        pkAuthTag: payload.pkAuthTag,
        dekEncrypted: payload.dekEncrypted,
        dekIv: payload.dekIv,
        dekAuthTag: payload.dekAuthTag,
        dekSalt: payload.dekSalt,
        source: 'imported',
        isAssigned: false,
        assignedProjectId: null,
      })

      log.info({ userId, walletId: wallet.id, publicKey }, 'Wallet imported')
      return wallet
    }
    finally {
      // Inv 2: zero the decoded secret key
      secretKeyBuf?.fill(0)
    }
  }

  /**
   * Decrypts a wallet's private key for operational use.
   * Always creates an audit log entry (invariant — every decrypt is logged).
   *
   * ⚠️  Caller MUST zero the returned string value after use.
   * The string itself can't be automatically zeroed but keeping it short-lived
   * limits exposure window.
   *
   * @param walletId - UUID of the wallet record
   * @param purpose  - Audit context: 'sell' | 'display' | 'recovery'
   * @param userId   - Owner's user UUID (for audit log)
   */
  async decryptWalletKey(
    walletId: string,
    purpose: 'sell' | 'display' | 'recovery',
    userId: string,
  ): Promise<string> {
    const wallet = await this.walletRepo.findById(walletId)
    if (!wallet) {
      throw new WalletError(`Wallet not found: ${walletId}`, 'WALLET_NOT_FOUND')
    }

    const privateKey = this.crypto.decryptPrivateKey({
      encryptedPrivateKey: wallet.encryptedPrivateKey,
      pkIv: wallet.pkIv,
      pkAuthTag: wallet.pkAuthTag,
      dekEncrypted: wallet.dekEncrypted,
      dekIv: wallet.dekIv,
      dekAuthTag: wallet.dekAuthTag,
      dekSalt: wallet.dekSalt,
    })

    // Always log decrypt events — invariant (every key access is auditable)
    await this.auditRepo.create({
      userId,
      eventType: 'wallet.decrypt',
      eventData: { walletId, purpose, publicKey: wallet.publicKey },
    })

    return privateKey
  }

  /**
   * Assigns a wallet to a project.
   * Sets `is_assigned = true` and `assigned_project_id = projectId`.
   */
  async assignWallet(walletId: string, projectId: string): Promise<void> {
    await this.walletRepo.setAssigned(walletId, true, projectId)
  }

  /**
   * Unassigns a wallet from its current project.
   * Clears `is_assigned` and `assigned_project_id`.
   */
  async unassignWallet(walletId: string): Promise<void> {
    await this.walletRepo.setAssigned(walletId, false, null)
  }

  /**
   * Lists all wallets for a user.
   * Returns full records — callers should expose only `publicKey` to users.
   */
  async listWallets(userId: string): Promise<WalletRecord[]> {
    return this.walletRepo.findByUserId(userId)
  }

  /** Returns wallets that are not yet assigned to any project */
  async getUnassignedWallets(userId: string): Promise<WalletRecord[]> {
    const all = await this.walletRepo.findByUserId(userId)
    return all.filter(w => !w.isAssigned)
  }
}

import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto'

import {
  AES_KEY_LENGTH,
  AUTH_TAG_LENGTH,
  IV_LENGTH,
  PBKDF2_ITERATIONS,
  SALT_LENGTH,
} from '#root/utils/constants.js'
import { WalletError } from '#root/utils/errors.js'

// ── Payload stored in the DB for each encrypted wallet ───────────────────────
// Both `wallets` and `ephemeral_wallets` tables share this exact shape.
export interface WalletEncryptionPayload {
  /** base64 — AES-256-GCM ciphertext of private key (encrypted with DEK) */
  encryptedPrivateKey: string
  /** base64 — 16-byte IV for the private-key layer */
  pkIv: string
  /** base64 — 16-byte GCM auth tag for the private-key layer */
  pkAuthTag: string
  /** base64 — AES-256-GCM ciphertext of DEK (encrypted with MEK) */
  dekEncrypted: string
  /** base64 — 16-byte IV for the DEK layer */
  dekIv: string
  /** base64 — 16-byte GCM auth tag for the DEK layer */
  dekAuthTag: string
  /** base64 — 32-byte per-wallet PBKDF2 salt (used to re-derive MEK at decrypt time) */
  dekSalt: string
}

/**
 * CryptoService — 2-layer envelope encryption for Solana wallet private keys.
 *
 * Key hierarchy (ARCHITECTURE.md §4.2):
 *   MASTER_KEY_SECRET (env, 32 bytes)
 *     → PBKDF2-SHA512 (600 K iters, per-wallet 32-byte random salt) → MEK (never persisted)
 *       → AES-256-GCM (MEK encrypts random DEK)
 *         → AES-256-GCM (DEK encrypts private key base58 string)
 *
 * Security invariants honoured:
 *   Inv 1: MASTER_KEY_SECRET never stored/logged/transmitted
 *   Inv 2: plaintext key buffers zeroed with .fill(0) in every finally block
 *   Inv 3: private keys never appear in any log output
 *   Inv 4: all private keys encrypted before DB storage
 */
export class CryptoService {
  private readonly masterSecret: Buffer

  constructor(masterKeyHex: string) {
    if (!/^[0-9a-f]{64}$/.test(masterKeyHex)) {
      throw new WalletError(
        'MASTER_KEY_SECRET must be exactly 64 lowercase hex characters',
        'CRYPTO_INIT',
      )
    }
    this.masterSecret = Buffer.from(masterKeyHex, 'hex')
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Derives a MEK (Master Encryption Key) from the master secret + per-wallet salt.
   * Caller MUST zero the returned buffer in a finally block.
   */
  private deriveMEK(salt: Buffer): Buffer {
    return pbkdf2Sync(
      this.masterSecret,
      salt,
      PBKDF2_ITERATIONS,
      AES_KEY_LENGTH, // 32 bytes → AES-256
      'sha512',
    )
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Encrypts a base58-encoded Solana private key into a `WalletEncryptionPayload`.
   * A fresh random DEK and salt are generated on every call — two encryptions of
   * the same key will produce completely different ciphertexts.
   *
   * @param privateKeyBase58 - The raw base58 private key (64 bytes when decoded)
   */
  encryptPrivateKey(privateKeyBase58: string): WalletEncryptionPayload {
    // Generate fresh per-wallet salt + random DEK
    const dekSalt = randomBytes(SALT_LENGTH) // 32 bytes
    const dek = randomBytes(AES_KEY_LENGTH) // 32 bytes
    let mek: Buffer | null = null

    try {
      // ── Layer 2: encrypt private key with DEK (AES-256-GCM) ─────────────────
      const pkIv = randomBytes(IV_LENGTH)
      const pkCipher = createCipheriv('aes-256-gcm', dek, pkIv)
      const pkCt = Buffer.concat([
        pkCipher.update(privateKeyBase58, 'utf8'),
        pkCipher.final(),
      ])
      const pkAuthTag = pkCipher.getAuthTag() // exactly AUTH_TAG_LENGTH bytes

      // ── Layer 1: encrypt DEK with MEK (AES-256-GCM) ─────────────────────────
      mek = this.deriveMEK(dekSalt)
      const dekIv = randomBytes(IV_LENGTH)
      const dekCipher = createCipheriv('aes-256-gcm', mek, dekIv)
      const dekCt = Buffer.concat([dekCipher.update(dek), dekCipher.final()])
      const dekAuthTag = dekCipher.getAuthTag()

      return {
        encryptedPrivateKey: pkCt.toString('base64'),
        pkIv: pkIv.toString('base64'),
        pkAuthTag: pkAuthTag.toString('base64'),
        dekEncrypted: dekCt.toString('base64'),
        dekIv: dekIv.toString('base64'),
        dekAuthTag: dekAuthTag.toString('base64'),
        dekSalt: dekSalt.toString('base64'),
      }
    }
    finally {
      // Inv 2: zero sensitive key material immediately after use
      dek.fill(0)
      mek?.fill(0)
    }
  }

  /**
   * Decrypts a `WalletEncryptionPayload` back to the base58 private key string.
   * The MEK and DEK are zeroed in the finally block.
   * Caller is responsible for zeroing the returned string value after use.
   *
   * @throws {WalletError} if decryption fails (bad key, tampered data, wrong auth tag)
   */
  decryptPrivateKey(payload: WalletEncryptionPayload): string {
    const dekSaltBuf = Buffer.from(payload.dekSalt, 'base64')
    let mek: Buffer | null = null
    let dek: Buffer | null = null

    try {
      // ── Layer 1: re-derive MEK + decrypt DEK ────────────────────────────────
      mek = this.deriveMEK(dekSaltBuf)
      const dekDecipher = createDecipheriv(
        'aes-256-gcm',
        mek,
        Buffer.from(payload.dekIv, 'base64'),
      )
      dekDecipher.setAuthTag(Buffer.from(payload.dekAuthTag, 'base64'))
      dek = Buffer.concat([
        dekDecipher.update(Buffer.from(payload.dekEncrypted, 'base64')),
        dekDecipher.final(),
      ])

      // ── Layer 2: decrypt private key with DEK ───────────────────────────────
      const pkDecipher = createDecipheriv(
        'aes-256-gcm',
        dek,
        Buffer.from(payload.pkIv, 'base64'),
      )
      pkDecipher.setAuthTag(Buffer.from(payload.pkAuthTag, 'base64'))
      const privateKey = Buffer.concat([
        pkDecipher.update(Buffer.from(payload.encryptedPrivateKey, 'base64')),
        pkDecipher.final(),
      ]).toString('utf8')

      return privateKey
    }
    catch (err) {
      // Preserve auth-tag errors as WalletError so callers can handle them
      if (err instanceof WalletError)
        throw err
      throw new WalletError(
        'Decryption failed — likely wrong master key or tampered ciphertext',
        err,
      )
    }
    finally {
      // Inv 2: zero key material regardless of success/failure
      mek?.fill(0)
      dek?.fill(0)
    }
  }

  /**
   * Returns the base64-encoded auth tag length in bytes for assertion in tests.
   * Exposed for testing only — not part of the public contract.
   */
  static get AUTH_TAG_LENGTH(): number {
    return AUTH_TAG_LENGTH
  }
}


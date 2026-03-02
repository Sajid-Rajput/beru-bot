import { describe, expect, it } from 'vitest'

import { CryptoService, type WalletEncryptionPayload } from '../crypto.service.js'

// ── Test constants ────────────────────────────────────────────────────────────
const VALID_HEX_64 = 'a'.repeat(64) // 64 lowercase hex chars (valid master key)
const DIFFERENT_KEY = 'b'.repeat(64)

// A real-world Solana base58 private key (64-byte representation, 88 chars base58)
// This is a deterministic test key — NOT used anywhere real.
const SAMPLE_PRIVATE_KEY_B58 = '5Hx9QBaT4KwAfqcuZwuQx9cK2XGn1UhNJgpP4X4M3tPEQ3T7QvM7DaAo4XzRSv8GjLqJfH3XbVDMBk2CW1'

describe('CryptoService', () => {
  // ── Constructor ─────────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('accepts valid 64-char lowercase hex master key', () => {
      expect(() => new CryptoService(VALID_HEX_64)).not.toThrow()
    })

    it('rejects key shorter than 64 chars', () => {
      expect(() => new CryptoService('a'.repeat(63))).toThrow('MASTER_KEY_SECRET')
    })

    it('rejects key with uppercase hex chars', () => {
      expect(() => new CryptoService('A'.repeat(64))).toThrow('MASTER_KEY_SECRET')
    })

    it('rejects non-hex characters', () => {
      expect(() => new CryptoService('z'.repeat(64))).toThrow('MASTER_KEY_SECRET')
    })

    it('rejects empty string', () => {
      expect(() => new CryptoService('')).toThrow('MASTER_KEY_SECRET')
    })
  })

  // ── Round-trip: encrypt → decrypt ────────────────────────────────────────────

  describe('encrypt → decrypt round-trip', () => {
    it('decrypts back to the original private key', () => {
      const crypto = new CryptoService(VALID_HEX_64)
      const payload = crypto.encryptPrivateKey(SAMPLE_PRIVATE_KEY_B58)
      const decrypted = crypto.decryptPrivateKey(payload)
      expect(decrypted).toBe(SAMPLE_PRIVATE_KEY_B58)
    })

    it('round-trip works with a simple ASCII test key', () => {
      const crypto = new CryptoService(VALID_HEX_64)
      const testKey = 'test-private-key-value'
      const payload = crypto.encryptPrivateKey(testKey)
      expect(crypto.decryptPrivateKey(payload)).toBe(testKey)
    })
  })

  // ── Payload structure ────────────────────────────────────────────────────────

  describe('encryptPrivateKey payload', () => {
    it('returns all 7 required fields', () => {
      const crypto = new CryptoService(VALID_HEX_64)
      const payload = crypto.encryptPrivateKey('test-key')
      const fields: (keyof WalletEncryptionPayload)[] = [
        'encryptedPrivateKey',
        'pkIv',
        'pkAuthTag',
        'dekEncrypted',
        'dekIv',
        'dekAuthTag',
        'dekSalt',
      ]
      for (const field of fields) {
        expect(payload).toHaveProperty(field)
        expect(typeof payload[field]).toBe('string')
        expect(payload[field].length).toBeGreaterThan(0)
      }
    })

    it('base64-decoded pkIv and dekIv are exactly 16 bytes', () => {
      const crypto = new CryptoService(VALID_HEX_64)
      const payload = crypto.encryptPrivateKey('test-key')
      expect(Buffer.from(payload.pkIv, 'base64').length).toBe(16)
      expect(Buffer.from(payload.dekIv, 'base64').length).toBe(16)
    })

    it('base64-decoded dekSalt is exactly 32 bytes', () => {
      const crypto = new CryptoService(VALID_HEX_64)
      const payload = crypto.encryptPrivateKey('test-key')
      expect(Buffer.from(payload.dekSalt, 'base64').length).toBe(32)
    })

    it('base64-decoded pkAuthTag and dekAuthTag are exactly 16 bytes', () => {
      const crypto = new CryptoService(VALID_HEX_64)
      const payload = crypto.encryptPrivateKey('test-key')
      expect(Buffer.from(payload.pkAuthTag, 'base64').length).toBe(16)
      expect(Buffer.from(payload.dekAuthTag, 'base64').length).toBe(16)
    })
  })

  // ── Different salts on each call ─────────────────────────────────────────────

  describe('different salts', () => {
    it('produces different dekSalt on every encrypt call', () => {
      const crypto = new CryptoService(VALID_HEX_64)
      const p1 = crypto.encryptPrivateKey('same-key')
      const p2 = crypto.encryptPrivateKey('same-key')
      expect(p1.dekSalt).not.toBe(p2.dekSalt)
    })

    it('produces different ciphertexts on every encrypt call', () => {
      const crypto = new CryptoService(VALID_HEX_64)
      const p1 = crypto.encryptPrivateKey('same-key')
      const p2 = crypto.encryptPrivateKey('same-key')
      expect(p1.encryptedPrivateKey).not.toBe(p2.encryptedPrivateKey)
      expect(p1.dekEncrypted).not.toBe(p2.dekEncrypted)
    })

    it('both payloads still decrypt correctly to the same original key', () => {
      const crypto = new CryptoService(VALID_HEX_64)
      const pk = 'same-key-value'
      const p1 = crypto.encryptPrivateKey(pk)
      const p2 = crypto.encryptPrivateKey(pk)
      expect(crypto.decryptPrivateKey(p1)).toBe(pk)
      expect(crypto.decryptPrivateKey(p2)).toBe(pk)
    })
  })

  // ── Wrong master key ─────────────────────────────────────────────────────────

  describe('wrong master key', () => {
    it('throws WalletError when decrypting with a different master key', () => {
      const encryptor = new CryptoService(VALID_HEX_64)
      const decryptor = new CryptoService(DIFFERENT_KEY)
      const payload = encryptor.encryptPrivateKey('test-key')
      expect(() => decryptor.decryptPrivateKey(payload)).toThrow()
    })

    it('error message does not contain the private key (invariant 3)', () => {
      const encryptor = new CryptoService(VALID_HEX_64)
      const decryptor = new CryptoService(DIFFERENT_KEY)
      const payload = encryptor.encryptPrivateKey('super-secret-private-key')
      try {
        decryptor.decryptPrivateKey(payload)
      }
      catch (err) {
        expect(String(err)).not.toContain('super-secret-private-key')
      }
    })
  })

  // ── Tampered ciphertext ──────────────────────────────────────────────────────

  describe('tampered ciphertext', () => {
    it('throws when encryptedPrivateKey is tampered', () => {
      const crypto = new CryptoService(VALID_HEX_64)
      const payload = crypto.encryptPrivateKey('test-key')
      // Flip the last byte of the ciphertext
      const tampered = Buffer.from(payload.encryptedPrivateKey, 'base64')
      tampered[tampered.length - 1] ^= 0xff
      const tamperedPayload: WalletEncryptionPayload = {
        ...payload,
        encryptedPrivateKey: tampered.toString('base64'),
      }
      expect(() => crypto.decryptPrivateKey(tamperedPayload)).toThrow()
    })

    it('throws when dekEncrypted is tampered', () => {
      const crypto = new CryptoService(VALID_HEX_64)
      const payload = crypto.encryptPrivateKey('test-key')
      const tampered = Buffer.from(payload.dekEncrypted, 'base64')
      tampered[0] ^= 0xff
      expect(() =>
        crypto.decryptPrivateKey({ ...payload, dekEncrypted: tampered.toString('base64') }),
      ).toThrow()
    })

    it('throws when pkAuthTag is tampered', () => {
      const crypto = new CryptoService(VALID_HEX_64)
      const payload = crypto.encryptPrivateKey('test-key')
      const tampered = Buffer.from(payload.pkAuthTag, 'base64')
      tampered[0] ^= 0x01
      expect(() =>
        crypto.decryptPrivateKey({ ...payload, pkAuthTag: tampered.toString('base64') }),
      ).toThrow()
    })
  })

  // ── Memory safety (invariant 2) ──────────────────────────────────────────────

  describe('memory safety', () => {
    it('encrypt does not expose DEK or MEK in returned payload', () => {
      const crypto = new CryptoService(VALID_HEX_64)
      const payload = crypto.encryptPrivateKey('test-key') as unknown as Record<string, unknown>
      // The payload object must only contain the 7 documented fields — no raw key buffers
      const allowedKeys = new Set([
        'encryptedPrivateKey',
        'pkIv',
        'pkAuthTag',
        'dekEncrypted',
        'dekIv',
        'dekAuthTag',
        'dekSalt',
      ])
      for (const key of Object.keys(payload)) {
        expect(allowedKeys.has(key)).toBe(true)
      }
    })

    it('decryptPrivateKey called with invalid payload cleans up and throws', () => {
      const crypto = new CryptoService(VALID_HEX_64)
      // Providing a non-base64 string to trigger early failure
      expect(() =>
        crypto.decryptPrivateKey({
          encryptedPrivateKey: '!!invalid',
          pkIv: '!!invalid',
          pkAuthTag: '!!invalid',
          dekEncrypted: '!!invalid',
          dekIv: '!!invalid',
          dekAuthTag: '!!invalid',
          dekSalt: '!!invalid',
        }),
      ).toThrow()
    })
  })
})

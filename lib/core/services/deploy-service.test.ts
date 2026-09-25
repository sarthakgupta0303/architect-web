import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { AppError } from '@/lib/api/errors'
import { AddDomainBody, UpsertSecretBody, decryptSecret, encryptSecret, keyId, loadEncryptionKey, secretLast4 } from './deploy-service'

const key = randomBytes(32)

describe('secret encryption (AES-256-GCM)', () => {
  it('round-trips plaintext, including unicode and large values', () => {
    for (const value of ['sk-live-1234567890abcdef', 'pässwörd 🔐', 'x'.repeat(32768)]) {
      const payload = encryptSecret(value, key, 'p:production:API_KEY')
      expect(payload).not.toContain(value.slice(0, 8))
      expect(decryptSecret(payload, key, 'p:production:API_KEY')).toBe(value)
    }
  })

  it('packs iv(12) || tag(16) || data and uses a fresh IV each time', () => {
    const a = encryptSecret('same-value', key)
    const b = encryptSecret('same-value', key)
    expect(a).not.toBe(b)
    expect(Buffer.from(a, 'base64').length).toBe(12 + 16 + Buffer.byteLength('same-value'))
  })

  it('rejects a wrong key, wrong AAD, or tampered ciphertext', () => {
    const payload = encryptSecret('top-secret', key, 'aad-1')
    expect(() => decryptSecret(payload, randomBytes(32), 'aad-1')).toThrow()
    expect(() => decryptSecret(payload, key, 'aad-2')).toThrow()
    const bytes = Buffer.from(payload, 'base64')
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 0xff
    expect(() => decryptSecret(bytes.toString('base64'), key, 'aad-1')).toThrow()
  })

  it('requires a 32-byte base64 SECRETS_ENCRYPTION_KEY', () => {
    expect(() => loadEncryptionKey(undefined)).toThrow(AppError)
    expect(() => loadEncryptionKey('')).toThrow(/SECRETS_ENCRYPTION_KEY/)
    expect(() => loadEncryptionKey(randomBytes(16).toString('base64'))).toThrow(/32 bytes/)
    expect(loadEncryptionKey(key.toString('base64')).equals(key)).toBe(true)
  })

  it('derives a stable key id that does not reveal the key', () => {
    expect(keyId(key)).toBe(keyId(Buffer.from(key)))
    expect(keyId(key)).not.toContain(key.toString('hex').slice(0, 12))
  })

  it('only shows the last 4 characters of long values', () => {
    expect(secretLast4('sk-abcdefgh1234')).toBe('1234')
    expect(secretLast4('short')).toBe('****')
  })
})

describe('validation', () => {
  it('enforces secret name and value rules', () => {
    expect(UpsertSecretBody.safeParse({ environment: 'production', name: 'OPENAI_API_KEY', value: 'v' }).success).toBe(true)
    expect(UpsertSecretBody.safeParse({ environment: 'production', name: 'openai_key', value: 'v' }).success).toBe(false)
    expect(UpsertSecretBody.safeParse({ environment: 'production', name: '1KEY', value: 'v' }).success).toBe(false)
    expect(UpsertSecretBody.safeParse({ environment: 'production', name: 'KEY', value: '' }).success).toBe(false)
    expect(UpsertSecretBody.safeParse({ environment: 'production', name: 'KEY', value: 'x'.repeat(32769) }).success).toBe(false)
  })

  it('normalises hostnames and rejects architect.app subdomains', () => {
    const ok = AddDomainBody.safeParse({ hostname: ' Support.Example.com. ' })
    expect(ok.success && ok.data.hostname).toBe('support.example.com')
    expect(AddDomainBody.safeParse({ hostname: 'my-app.architect.app' }).success).toBe(false)
    expect(AddDomainBody.safeParse({ hostname: 'not a domain' }).success).toBe(false)
  })
})

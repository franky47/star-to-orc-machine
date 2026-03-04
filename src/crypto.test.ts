import { describe, expect, it } from 'bun:test'
import { createHmac } from 'node:crypto'
import { verifySignature } from './crypto'

describe('verifySignature', () => {
  const secret = 'test-secret'

  function sign(payload: Buffer): string {
    return `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`
  }

  it('returns true for a valid signature', () => {
    const body = Buffer.from('{"action":"created"}')
    expect(verifySignature(body, sign(body), secret)).toBe(true)
  })

  it('returns false for a tampered payload', () => {
    const body = Buffer.from('{"action":"created"}')
    const other = Buffer.from('{"action":"deleted"}')
    expect(verifySignature(other, sign(body), secret)).toBe(false)
  })

  it('returns false when the signature prefix is missing', () => {
    const body = Buffer.from('hello')
    const badSig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifySignature(body, badSig, secret)).toBe(false)
  })

  it('returns false for an empty signature', () => {
    const body = Buffer.from('hello')
    expect(verifySignature(body, '', secret)).toBe(false)
  })

  it('returns false when secrets differ', () => {
    const body = Buffer.from('hello')
    expect(verifySignature(body, sign(body), 'wrong-secret')).toBe(false)
  })
})

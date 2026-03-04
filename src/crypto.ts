import { createHmac, timingSafeEqual } from 'node:crypto'

/** Verify the X-Hub-Signature-256 header against the raw payload. */
export function verifySignature(
  rawBody: Buffer,
  signature: string,
  secret: string,
): boolean {
  if (!signature.startsWith('sha256=')) return false
  const hmac = createHmac('sha256', secret)
  hmac.update(rawBody)
  const expected = `sha256=${hmac.digest('hex')}`
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

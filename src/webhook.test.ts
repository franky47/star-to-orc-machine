import { createHmac } from 'node:crypto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { verifySignature } from '../api/github/webhook.js'

// ---------------------------------------------------------------------------
// verifySignature
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Payload mapping via the full handler
// ---------------------------------------------------------------------------
describe('handler – payload mapping', () => {
  const secret = 'webhook-secret'

  function makeStarPayload(action = 'created') {
    return {
      action,
      repository: {
        full_name: 'owner/my-repo',
        html_url: 'https://github.com/owner/my-repo',
        description: 'A cool repo',
      },
    }
  }

  function signPayload(body: string) {
    return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
  }

  // Build minimal mock req / res objects
  function buildReqRes(
    body: string,
    headers: Record<string, string>,
  ): [import('node:http').IncomingMessage, import('node:http').ServerResponse] {
    const chunks = [Buffer.from(body)]
    let idx = 0

    const req = {
      method: 'POST',
      headers,
      on(event: string, cb: (...args: unknown[]) => void) {
        if (event === 'data' && idx < chunks.length) cb(chunks[idx++])
        if (event === 'end') cb()
        return req
      },
    } as unknown as import('node:http').IncomingMessage

    let statusCode = 200
    let responseBody = ''
    const res = {
      writeHead(code: number) {
        statusCode = code
        return res
      },
      end(data?: string) {
        responseBody = data ?? ''
        return res
      },
      get statusCode() {
        return statusCode
      },
      get body() {
        return responseBody
      },
    } as unknown as import('node:http').ServerResponse & {
      statusCode: number
      body: string
    }

    return [req, res as unknown as import('node:http').ServerResponse]
  }

  beforeEach(() => {
    vi.stubEnv('GITHUB_WEBHOOK_SECRET', secret)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns 401 when signature is invalid', async () => {
    const { default: handler } = await import('../api/github/webhook.js')
    const body = JSON.stringify(makeStarPayload())
    const [req, res] = buildReqRes(body, {
      'x-github-event': 'star',
      'x-hub-signature-256': 'sha256=badsignature',
    })
    await handler(req, res)
    expect((res as unknown as { statusCode: number }).statusCode).toBe(401)
  })

  it('returns 202 for non-star events', async () => {
    const { default: handler } = await import('../api/github/webhook.js')
    const body = JSON.stringify({ action: 'created' })
    const [req, res] = buildReqRes(body, {
      'x-github-event': 'push',
      'x-hub-signature-256': signPayload(body),
    })
    await handler(req, res)
    expect((res as unknown as { statusCode: number }).statusCode).toBe(202)
  })

  it('returns 204 for star events with action != created', async () => {
    const { default: handler } = await import('../api/github/webhook.js')
    const body = JSON.stringify(makeStarPayload('deleted'))
    const [req, res] = buildReqRes(body, {
      'x-github-event': 'star',
      'x-hub-signature-256': signPayload(body),
    })
    await handler(req, res)
    expect((res as unknown as { statusCode: number }).statusCode).toBe(204)
  })

  it('forwards star:created with correct JSON body to TARGET_URL', async () => {
    vi.stubEnv('TARGET_URL', 'https://example.com/projects')

    let capturedBody: unknown = null
    const fetchSpy = vi.fn((_url: string, opts: RequestInit) => {
      capturedBody = JSON.parse(opts.body as string)
      return Promise.resolve({ ok: true } as Response)
    })
    vi.stubGlobal('fetch', fetchSpy)

    // Re-import to pick up freshly stubbed env
    vi.resetModules()
    const { default: handler } = await import('../api/github/webhook.js')

    const payload = makeStarPayload()
    const body = JSON.stringify(payload)
    const [req, res] = buildReqRes(body, {
      'x-github-event': 'star',
      'x-hub-signature-256': signPayload(body),
    })
    await handler(req, res)

    expect((res as unknown as { statusCode: number }).statusCode).toBe(200)
    expect(fetchSpy).toHaveBeenCalledOnce()
    expect(fetchSpy.mock.calls[0][0]).toBe('https://example.com/projects')
    expect(capturedBody).toEqual({
      name: 'owner/my-repo',
      githubRepoUrl: 'https://github.com/owner/my-repo',
      description: 'A cool repo',
    })

    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('returns 502 when upstream returns an error', async () => {
    vi.stubEnv('TARGET_URL', 'https://example.com/projects')
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 500 } as Response)),
    )

    vi.resetModules()
    const { default: handler } = await import('../api/github/webhook.js')

    const body = JSON.stringify(makeStarPayload())
    const [req, res] = buildReqRes(body, {
      'x-github-event': 'star',
      'x-hub-signature-256': signPayload(body),
    })
    await handler(req, res)

    expect((res as unknown as { statusCode: number }).statusCode).toBe(502)

    vi.unstubAllGlobals()
    vi.resetModules()
  })
})

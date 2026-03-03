import { createHmac } from 'node:crypto'
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
} from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { verifySignature } from '../src/crypto.js'
import { createTestServer, type TestServer } from '../src/test-utils.js'

// ---------------------------------------------------------------------------
// verifySignature (pure function – no env dependency)
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
// Webhook handler – integration tests via real HTTP server + msw
// ---------------------------------------------------------------------------
describe('handler – payload mapping', () => {
  const secret = 'webhook-secret'
  const targetUrl = 'https://example.com/projects'

  function sign(body: string): string {
    return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
  }

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

  // msw intercepts outgoing fetch from the handler.
  // Requests to the local test server (127.0.0.1) are silently ignored so
  // that they reach the real Node.js server started in beforeEach.
  const mswServer = setupServer()
  beforeAll(() =>
    mswServer.listen({
      onUnhandledRequest(request, print) {
        if (new URL(request.url).hostname !== '127.0.0.1') print.error()
      },
    }),
  )
  afterEach(() => mswServer.resetHandlers())
  afterAll(() => mswServer.close())

  let server: TestServer

  beforeEach(async () => {
    vi.stubEnv('GITHUB_WEBHOOK_SECRET', secret)
    vi.stubEnv('TARGET_URL', targetUrl)
    vi.resetModules()
    const { default: handler } = await import('../api/github/webhook.js')
    server = await createTestServer(handler)
  })

  afterEach(async () => {
    await server.close()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  async function post(body: string, headers: Record<string, string>) {
    return fetch(server.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body,
    })
  }

  it('returns 401 when signature is invalid', async () => {
    const body = JSON.stringify(makeStarPayload())
    const res = await post(body, {
      'x-github-event': 'star',
      'x-hub-signature-256': 'sha256=badsignature',
    })
    expect(res.status).toBe(401)
  })

  it('returns 202 for non-star events', async () => {
    const body = JSON.stringify({ action: 'created' })
    const res = await post(body, {
      'x-github-event': 'push',
      'x-hub-signature-256': sign(body),
    })
    expect(res.status).toBe(202)
  })

  it('returns 200 for installation event', async () => {
    const body = JSON.stringify({ action: 'created', installation: { id: 1 } })
    const res = await post(body, {
      'x-github-event': 'installation',
      'x-hub-signature-256': sign(body),
    })
    expect(res.status).toBe(200)
  })

  it('returns 200 for installation_repositories event', async () => {
    const body = JSON.stringify({ action: 'added' })
    const res = await post(body, {
      'x-github-event': 'installation_repositories',
      'x-hub-signature-256': sign(body),
    })
    expect(res.status).toBe(200)
  })

  it('returns 204 for star events with action != created', async () => {
    const body = JSON.stringify(makeStarPayload('deleted'))
    const res = await post(body, {
      'x-github-event': 'star',
      'x-hub-signature-256': sign(body),
    })
    expect(res.status).toBe(204)
  })

  it('forwards star:created with correct JSON body to TARGET_URL', async () => {
    let capturedBody: unknown = null
    mswServer.use(
      http.post(targetUrl, async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json({ success: true })
      }),
    )

    const payload = makeStarPayload()
    const body = JSON.stringify(payload)
    const res = await post(body, {
      'x-github-event': 'star',
      'x-hub-signature-256': sign(body),
    })

    expect(res.status).toBe(200)
    expect(capturedBody).toEqual({
      name: 'owner/my-repo',
      githubRepoUrl: 'https://github.com/owner/my-repo',
      description: 'A cool repo',
    })
  })

  it('returns 502 when upstream returns an error', async () => {
    mswServer.use(
      http.post(targetUrl, () => HttpResponse.json({}, { status: 500 })),
    )

    const body = JSON.stringify(makeStarPayload())
    const res = await post(body, {
      'x-github-event': 'star',
      'x-hub-signature-256': sign(body),
    })
    expect(res.status).toBe(502)
  })
})

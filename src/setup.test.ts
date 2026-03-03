import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest'
import { setupServer } from 'msw/node'
import setupHandler from '../api/github/setup.js'
import { createTestServer, type TestServer } from './test-utils.js'

// msw server is present to catch any unintended outgoing network calls from
// the handler; localhost requests to the test server are silently ignored.
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

describe('setup handler', () => {
  let server: TestServer

  beforeEach(async () => {
    server = await createTestServer(setupHandler)
  })

  afterEach(async () => {
    await server.close()
  })

  it('returns 200 with an HTML page on fresh install', async () => {
    const res = await fetch(
      `${server.url}/api/github/setup?installation_id=12345&setup_action=install`,
    )
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('✅ App installed!')
    expect(body).toContain('12345')
  })

  it('shows "updated" message when setup_action is update', async () => {
    const res = await fetch(
      `${server.url}/api/github/setup?installation_id=99&setup_action=update`,
    )
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('✅ App updated!')
  })

  it('works without query params', async () => {
    const res = await fetch(`${server.url}/api/github/setup`)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('✅ App installed!')
    expect(body).not.toContain('Installation ID:')
  })
})




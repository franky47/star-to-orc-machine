import { treaty } from '@elysiajs/eden'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test'
import Elysia from 'elysia'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { createHmac } from 'node:crypto'
import { env } from '../env'
import { webhookRoutes } from './webhook'

const app = new Elysia().use(webhookRoutes)
const api = treaty(app)

const mswServer = setupServer()

function sign(body: string): string {
  return `sha256=${createHmac('sha256', env.GITHUB_WEBHOOK_SECRET).update(body).digest('hex')}`
}

describe('webhook handler', () => {
  function makeStarPayload(
    action = 'created',
    description: string | null = 'A cool repo',
  ) {
    return {
      action,
      repository: {
        full_name: 'owner/my-repo',
        html_url: 'https://github.com/owner/my-repo',
        description,
      },
    } as const
  }

  beforeAll(() => mswServer.listen())
  afterEach(() => mswServer.resetHandlers())
  afterAll(() => mswServer.close())

  it('returns 401 when signature is invalid', async () => {
    const res = await api.webhook.post(
      {
        action: 'created',
        repository: {
          full_name: 'owner/my-repo',
          html_url: 'https://github.com/owner/my-repo',
          description: 'A cool repo',
        },
      },
      {
        headers: {
          'x-github-event': 'star',
          'x-hub-signature-256': 'sha256=badsignature',
        },
      },
    )
    expect(res.status).toBe(401)
  })

  it('returns 400 for unknown event types', async () => {
    const body = JSON.stringify({ action: 'created' })
    const res = await api.webhook.post(body, {
      headers: {
        // @ts-expect-error - testing unknown event type
        'x-github-event': 'push',
        'x-hub-signature-256': sign(body),
      },
    })
    expect(res.status).toBe(400)
  })

  it('returns 200 for installation event', async () => {
    const body = JSON.stringify({ action: 'created', installation: { id: 1 } })
    const res = await api.webhook.post(body, {
      headers: {
        'x-github-event': 'installation',
        'x-hub-signature-256': sign(body),
      },
    })
    expect(res.status).toBe(200)
  })

  it('returns 200 for installation_repositories event', async () => {
    const body = JSON.stringify({ action: 'added' })
    const res = await api.webhook.post(body, {
      headers: {
        'x-github-event': 'installation_repositories',
        'x-hub-signature-256': sign(body),
      },
    })
    expect(res.status).toBe(200)
  })

  it('returns 204 for star events with action != created', async () => {
    const body = JSON.stringify(makeStarPayload('deleted'))
    const res = await api.webhook.post(body, {
      headers: {
        'x-github-event': 'star',
        'x-hub-signature-256': sign(body),
      },
    })
    expect(res.status).toBe(204)
  })

  it('forwards star:created with correct JSON body to TARGET_URL', async () => {
    let capturedBody: unknown = null
    mswServer.use(
      http.post(env.TARGET_URL, async ({ request }) => {
        capturedBody = await request.json()
        return new Response(null, { status: 200 })
      }),
    )

    const body = JSON.stringify(makeStarPayload())
    const res = await api.webhook.post(body, {
      headers: {
        'x-github-event': 'star',
        'x-hub-signature-256': sign(body),
      },
    })

    expect(res.status).toBe(200)
    expect(capturedBody).toEqual({
      name: 'owner/my-repo',
      githubRepoUrl: 'https://github.com/owner/my-repo',
      description: 'A cool repo',
    })
  })

  it('uses "No description provided" when description is null', async () => {
    let capturedBody: unknown = null
    mswServer.use(
      http.post(env.TARGET_URL, async ({ request }) => {
        capturedBody = await request.json()
        return new Response(null, { status: 200 })
      }),
    )

    const body = JSON.stringify(makeStarPayload('created', null))
    const res = await api.webhook.post(body, {
      headers: {
        'x-github-event': 'star',
        'x-hub-signature-256': sign(body),
      },
    })

    expect(res.status).toBe(200)
    expect(capturedBody).toEqual({
      name: 'owner/my-repo',
      githubRepoUrl: 'https://github.com/owner/my-repo',
      description: 'No description provided',
    })
  })

  it('returns 502 when upstream returns an error', async () => {
    mswServer.use(
      http.post(env.TARGET_URL, () => HttpResponse.json({}, { status: 500 })),
    )

    const body = JSON.stringify(makeStarPayload())
    const res = await api.webhook.post(body, {
      headers: {
        'x-github-event': 'star',
        'x-hub-signature-256': sign(body),
      },
    })
    expect(res.status).toBe(502)
  })
})

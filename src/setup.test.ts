import { describe, it, expect } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import setupHandler from '../api/github/setup.js'

function buildSetupReqRes(url: string): [IncomingMessage, ServerResponse & { statusCode: number; body: string }] {
  const req = {
    url,
    headers: { host: 'localhost' },
    method: 'GET',
  } as unknown as IncomingMessage

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
    get statusCode() { return statusCode },
    get body() { return responseBody },
  } as unknown as ServerResponse & { statusCode: number; body: string }

  return [req, res]
}

describe('setup handler', () => {
  it('returns 200 with an HTML page on fresh install', () => {
    const [req, res] = buildSetupReqRes(
      '/api/github/setup?installation_id=12345&setup_action=install',
    )
    setupHandler(req, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('✅ App installed!')
    expect(res.body).toContain('12345')
  })

  it('shows "updated" message when setup_action is update', () => {
    const [req, res] = buildSetupReqRes(
      '/api/github/setup?installation_id=99&setup_action=update',
    )
    setupHandler(req, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('✅ App updated!')
  })

  it('works without query params', () => {
    const [req, res] = buildSetupReqRes('/api/github/setup')
    setupHandler(req, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('✅ App installed!')
    expect(res.body).not.toContain('Installation ID:')
  })
})

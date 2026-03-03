import { z } from 'zod'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { env } from '../../src/env.js'
import { verifySignature, readRawBody } from '../../src/crypto.js'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const webhookHeaders = z.object({
  'x-hub-signature-256': z.string().max(71),
  'x-github-event': z.enum(['star', 'installation', 'installation_repositories']),
})

const starCreatedPayload = z.object({
  action: z.literal('created'),
  repository: z.object({
    full_name: z.string(),
    html_url: z.string(),
    description: z.string().nullable(),
  }),
})

// ---------------------------------------------------------------------------
// Vercel config – disable default body parsing so we get raw bytes.
// ---------------------------------------------------------------------------

export const config = {
  api: { bodyParser: false },
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  const headersParsed = webhookHeaders.safeParse(req.headers)
  if (!headersParsed.success) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Missing required headers' }))
    return
  }

  const { 'x-hub-signature-256': signature, 'x-github-event': event } =
    headersParsed.data

  const rawBody = await readRawBody(req)

  if (!verifySignature(rawBody, signature, env.GITHUB_WEBHOOK_SECRET)) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Invalid signature' }))
    return
  }

  // GitHub App lifecycle events – acknowledge but take no action.
  if (event === 'installation' || event === 'installation_repositories') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ message: 'Installation event received' }))
    return
  }

  // event is 'star' here

  let rawPayload: unknown
  try {
    rawPayload = JSON.parse(rawBody.toString('utf8'))
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Invalid JSON' }))
    return
  }

  const payloadParsed = starCreatedPayload.safeParse(rawPayload)
  if (!payloadParsed.success) {
    // star event with action other than 'created', or unexpected shape
    res.writeHead(204)
    res.end()
    return
  }

  const { repository } = payloadParsed.data
  const body = JSON.stringify({
    name: repository.full_name,
    githubRepoUrl: repository.html_url,
    description: repository.description || 'No description provided',
  })

  const upstream = await fetch(env.TARGET_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })

  if (!upstream.ok) {
    console.error('Upstream error:', upstream.status, upstream.statusText)
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Upstream error' }))
    return
  }

  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ success: true }))
}

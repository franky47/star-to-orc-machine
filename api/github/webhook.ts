import { createHmac, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

export const TARGET_URL =
  process.env.TARGET_URL ?? 'https://project-review-api.vercel.app/projects'

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

/** Read the full request body as a Buffer. */
export function readRawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export interface StarPayload {
  action: string
  repository: {
    full_name: string
    html_url: string
    description: string | null
  }
}

/** Vercel serverless handler – disable default body parsing so we get raw bytes. */
export const config = {
  api: { bodyParser: false },
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  const secret = process.env.GITHUB_WEBHOOK_SECRET ?? ''
  const signature = (req.headers['x-hub-signature-256'] as string) ?? ''
  const event = (req.headers['x-github-event'] as string) ?? ''

  const rawBody = await readRawBody(req)

  if (!verifySignature(rawBody, signature, secret)) {
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

  if (event !== 'star') {
    res.writeHead(202, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ message: 'Event ignored' }))
    return
  }

  let payload: StarPayload
  try {
    payload = JSON.parse(rawBody.toString('utf8')) as StarPayload
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Invalid JSON' }))
    return
  }

  if (payload.action !== 'created') {
    res.writeHead(204)
    res.end()
    return
  }

  const { repository } = payload
  const body = JSON.stringify({
    name: repository.full_name,
    githubRepoUrl: repository.html_url,
    description: repository.description,
  })

  const upstream = await fetch(TARGET_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })

  if (!upstream.ok) {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Upstream error' }))
    return
  }

  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ success: true }))
}

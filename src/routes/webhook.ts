import Elysia from 'elysia'
import { z } from 'zod'
import { verifySignature } from '../crypto'
import { env } from '../env'

const headersSchema = z.object({
  'x-hub-signature-256': z.string().max(71),
  'x-github-event': z.enum([
    'star',
    'installation',
    'installation_repositories',
  ]),
})

const starCreatedPayloadSchema = z.object({
  action: z.enum(['created', 'deleted']),
  repository: z.object({
    full_name: z.string(),
    html_url: z.string(),
    description: z.string().nullable(),
  }),
})

export const webhookRoutes = new Elysia()
  .onParse(async ({ request }) => {
    // Disable JSON parsing & keep raw body as Buffer
    // for signature verification
    return Buffer.from(await request.arrayBuffer())
  })
  .derive(({ body, headers, status }) => {
    // Verify signature here using headers['x-hub-signature-256'] and the raw body
    // If verification fails, set status to 401 and return an error message
    const raw = body as Buffer
    const signature = headers['x-hub-signature-256']
    if (!signature) {
      return status(400, 'Missing signature')
    }
    if (!verifySignature(raw, signature, env.GITHUB_WEBHOOK_SECRET)) {
      return status(401, 'Invalid signature')
    }
    const event = headers['x-github-event'] ?? 'unknown'
    if (['installation', 'installation_repositories'].includes(event)) {
      return status(200, 'Installation event received')
    }
    if (headers['x-github-event'] !== 'star') {
      return status(400, 'Invalid event type')
    }
    const json = JSON.parse(raw.toString())
    const parsed = starCreatedPayloadSchema.safeParse(json)
    if (!parsed.success) {
      return status(400, 'Invalid payload')
    }
    return {
      body: parsed.data,
      headers,
    }
  })
  .post(
    '/webhook',
    async ({ headers, body, set }) => {
      if (headers['x-github-event'] !== 'star') {
        set.status = 200
        return { message: 'Installation event received' }
      }
      if (body.action !== 'created') {
        set.status = 204
        return null
      }
      const payload = {
        name: body.repository.full_name,
        githubRepoUrl: body.repository.html_url,
        description: body.repository.description || 'No description provided',
      }
      try {
        console.info(
          'Forwarding star event to upstream:',
          payload,
          env.TARGET_URL,
        )
        const upstream = await fetch(env.TARGET_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!upstream.ok) {
          console.error(
            'Upstream error:',
            upstream.status,
            upstream.statusText,
            await upstream.text(),
          )
          set.status = 502
          return { error: 'Failed to forward event to upstream' }
        }
      } catch (error) {
        console.error('Error forwarding star event:', error)
        set.status = 502
        return { error: 'Failed to forward event to upstream' }
      }
      return null
    },
    {
      headers: headersSchema,
    },
  )

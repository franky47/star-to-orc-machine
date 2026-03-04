import Elysia from 'elysia'
import { z } from 'zod'

const querySchema = z.object({
  installation_id: z.coerce.number().int().positive(),
  setup_action: z.enum(['install', 'update']).optional().default('install'),
})

export const setupRoutes = new Elysia().get(
  '/setup',
  async ({ query, set }) => {
    set.headers['Content-Type'] = 'text/html; charset=utf-8'
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>star-to-orc-machine</title>
  <style>body{font-family:sans-serif;max-width:480px;margin:4rem auto;padding:0 1rem}</style>
</head>
<body>
  <h1>${query.setup_action === 'update' ? '✅ App updated!' : '✅ App installed!'}</h1>
  <p>Every repository you ⭐ star on GitHub will now be forwarded to the
     <a href="https://review.thehorde.dev">OrcDev review queue</a>.</p>
  <p><small>Installation ID: ${query.installation_id}</small></p>
</body>
</html>`
  },
  { query: querySchema },
)

import { z } from 'zod'
import type { IncomingMessage, ServerResponse } from 'node:http'

const installationIdSchema = z.coerce.number().int().positive()

/**
 * Setup URL handler for the GitHub App installation flow.
 *
 * GitHub redirects here after a user installs (or updates) the app with:
 *   ?installation_id=<id>&setup_action=install|update
 *
 * The page simply confirms the installation to the user.
 */
export default function handler(
  req: IncomingMessage,
  res: ServerResponse,
): void {
  const url = new URL(
    req.url ?? '/',
    `http://${req.headers.host ?? 'localhost'}`,
  )
  const parsedId = installationIdSchema.safeParse(
    url.searchParams.get('installation_id'),
  )
  const installationId = parsedId.success ? String(parsedId.data) : null
  const setupAction = url.searchParams.get('setup_action') ?? 'install'

  const heading =
    setupAction === 'update' ? '✅ App updated!' : '✅ App installed!'

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>star-to-orc-machine</title>
  <style>body{font-family:sans-serif;max-width:480px;margin:4rem auto;padding:0 1rem}</style>
</head>
<body>
  <h1>${heading}</h1>
  <p>Every repository you ⭐ star on GitHub will now be forwarded to the
     <a href="https://review.thehorde.dev">OrcDev review queue</a>.</p>
  ${installationId ? `<p><small>Installation ID: ${installationId}</small></p>` : ''}
</body>
</html>`,
  )
}

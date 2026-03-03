import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>

export interface TestServer {
  url: string
  close: () => Promise<void>
}

/** Wrap a serverless-style handler in a real Node.js HTTP server for testing. */
export function createTestServer(handler: Handler): Promise<TestServer> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      Promise.resolve(handler(req, res)).catch((err: unknown) => {
        if (!res.headersSent) {
          res.writeHead(500)
          res.end(JSON.stringify({ error: String(err) }))
        }
      })
    })
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((res, rej) =>
            server.close((err) => (err ? rej(err) : res())),
          ),
      })
    })
  })
}

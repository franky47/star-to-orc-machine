import Elysia from 'elysia'
import { setupRoutes } from './routes/setup'
import { webhookRoutes } from './routes/webhook'

const app = new Elysia({
  prefix: '/api/github',
})
  .use(setupRoutes)
  .use(webhookRoutes)

export default app

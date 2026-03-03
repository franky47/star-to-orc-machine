import { z } from 'zod'

const EnvSchema = z.object({
  GITHUB_WEBHOOK_SECRET: z.string().min(1, 'GITHUB_WEBHOOK_SECRET is required'),
  TARGET_URL: z.url().default('https://orcish-api.com/api/projects'),
})

export const env = EnvSchema.parse(process.env)

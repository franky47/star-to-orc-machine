import { z } from 'zod'

const EnvSchema = z.object({
  GITHUB_WEBHOOK_SECRET: z.string().min(1, 'GITHUB_WEBHOOK_SECRET is required'),
  TARGET_URL: z
    .string()
    .url()
    .default('https://project-review-api.vercel.app/projects'),
})

export const env = EnvSchema.parse(process.env)

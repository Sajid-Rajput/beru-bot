import process from 'node:process'
import { defineConfig } from 'drizzle-kit'

// TODO: Replace with config import once T1.5 (.env + config.ts) is complete
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://beru:beru@localhost:5432/beru_bot',
  },
})

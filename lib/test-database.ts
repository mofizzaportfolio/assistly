import { URL } from 'node:url'

export function getApprovedTestDatabaseUrl(env: Partial<NodeJS.ProcessEnv> = process.env) {
  const url = env.TEST_DATABASE_URL?.trim()
  if (!url) throw new Error('TEST_DATABASE_URL is required; production DATABASE_URL is never used for integration tests.')
  if (env.ALLOW_TEST_DATABASE !== 'true') throw new Error('Set ALLOW_TEST_DATABASE=true explicitly to enable database integration tests.')
  const parsed = new URL(url)
  const productionUrl = env.DATABASE_URL?.trim()
  if (productionUrl && parsed.toString() === productionUrl) throw new Error('TEST_DATABASE_URL must not equal DATABASE_URL.')
  if (/^(prod|production|main|live)$/i.test(parsed.hostname) || /prod|production|live/i.test(parsed.pathname) || /^(prod|production|main|live)$/i.test(parsed.searchParams.get('branch') ?? '')) throw new Error('The configured test database appears to be production-like; refusing to connect.')
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('TEST_DATABASE_URL must be a PostgreSQL URL.')
  return parsed.toString()
}

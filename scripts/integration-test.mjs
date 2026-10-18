import pg from 'pg'
import { URL } from 'node:url'

const url = process.env.TEST_DATABASE_URL
if (!url || process.env.ALLOW_TEST_DATABASE !== 'true') {
  console.error('BLOCKED: set TEST_DATABASE_URL and ALLOW_TEST_DATABASE=true; production DATABASE_URL is never used.')
  process.exit(2)
}
const parsed = new URL(url)
if (/prod|production|live/i.test(`${parsed.hostname}${parsed.pathname}${parsed.search}`) || url === process.env.DATABASE_URL) {
  console.error('BLOCKED: TEST_DATABASE_URL appears to be production or equals DATABASE_URL.')
  process.exit(2)
}
const pool = new pg.Pool({ connectionString: url })
try {
  const { rows } = await pool.query("select current_database() as database, current_schema() as schema")
  console.log(`Connected to approved test database ${rows[0].database}/${rows[0].schema}.`)
  console.log('BLOCKED: schema bootstrap and full integration assertions are not run automatically; use a disposable Neon branch and apply schema explicitly before extending this harness.')
  process.exit(2)
} finally { await pool.end() }

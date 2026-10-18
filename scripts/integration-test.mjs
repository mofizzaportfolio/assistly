import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { URL } from 'node:url'

const rawUrl = process.env.TEST_DATABASE_URL?.trim()
if (!rawUrl || process.env.ALLOW_TEST_DATABASE !== 'true') {
  console.error('BLOCKED: set TEST_DATABASE_URL and ALLOW_TEST_DATABASE=true; production DATABASE_URL is never used.')
  process.exit(2)
}
const parsedUrl = new URL(rawUrl)
if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol) || rawUrl === process.env.DATABASE_URL || /prod|production|live/i.test(`${parsedUrl.hostname}${parsedUrl.pathname}${parsedUrl.search}`)) {
  console.error('BLOCKED: TEST_DATABASE_URL is missing, production-like, or equal to DATABASE_URL.')
  process.exit(2)
}
const connectionString = parsedUrl.toString()
const pool = new pg.Pool({ connectionString, max: 1 })
const ticketId = `INT-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`

try {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT id, ticket_id, idempotency_key FROM ticket_events LIMIT 0')
    await client.query(`INSERT INTO tickets (id, subject, customer, customer_email, original_message, category, tags, priority, risk_level, status, channel, team, is_demo) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, false)`, [ticketId, 'Integration verification ticket', 'Integration Test Customer', 'integration@example.test', 'Disposable integration test record.', 'General Support', '[]', 'Medium', 'Low', 'Open', 'web', 'Human Support'])
    await client.query(`INSERT INTO ticket_events (ticket_id, event_type, actor, visibility, body, metadata, idempotency_key) VALUES ($1, 'customer_message', 'customer', 'public', $2, '{}'::jsonb, $3)`, [ticketId, 'Customer-created message', 'initial-message'])
    await client.query(`INSERT INTO ticket_events (ticket_id, event_type, actor, visibility, body, metadata) VALUES ($1, 'private_note', 'support_agent', 'internal', $2, '{}'::jsonb)`, [ticketId, 'Private investigation note'])
    const publicEvents = await client.query(`SELECT event_type, visibility FROM ticket_events WHERE ticket_id = $1 AND visibility = 'public'`, [ticketId])
    const privateEvents = await client.query(`SELECT event_type, visibility FROM ticket_events WHERE ticket_id = $1 AND visibility = 'internal'`, [ticketId])
    if (publicEvents.rowCount !== 1 || privateEvents.rowCount !== 1) throw new Error('Public/private event visibility assertion failed.')
    await client.query(`UPDATE tickets SET team = 'Technical Team' WHERE id = $1`, [ticketId])
    await client.query(`INSERT INTO ticket_events (ticket_id, event_type, actor, visibility, body, metadata, idempotency_key) VALUES ($1, 'escalation', 'support_agent', 'internal', $2, $3::jsonb, $4)`, [ticketId, 'Escalated for technical investigation', JSON.stringify({ previousTeam: 'Human Support', nextTeam: 'Technical Team' }), 'escalation-1'])
    const duplicate = await client.query(`SELECT id FROM ticket_events WHERE ticket_id = $1 AND idempotency_key = $2`, [ticketId, 'escalation-1'])
    if (duplicate.rowCount !== 1) throw new Error('Idempotency lookup assertion failed.')
    await client.query('ROLLBACK')
    console.log(`PASS: disposable database workflow verified for ${ticketId}; transaction rolled back.`)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
} finally {
  await pool.end()
}

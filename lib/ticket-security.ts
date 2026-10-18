import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export const STAFF_ROLES = ['support_agent', 'technical_agent', 'supervisor', 'team_lead', 'administrator'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]
const SESSION_TTL_SECONDS = 60 * 60 * 8

export const TICKET_STATUSES = ['Open', 'Awaiting approval', 'Escalated', 'Resolved', 'Closed'] as const

export function isStaffRole(value: unknown): value is StaffRole { return typeof value === 'string' && (STAFF_ROLES as readonly string[]).includes(value) }

export function hashStaffPassword(password: string, salt = randomBytes(16).toString('hex')) {
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}

export function isValidStaffPasswordHash(encoded: unknown): encoded is string {
  if (typeof encoded !== 'string') return false
  const [scheme, salt, digest, extra] = encoded.split(':')
  return scheme === 'scrypt' && Boolean(salt) && !extra && /^[a-f0-9]{128}$/i.test(digest ?? '') && /^[a-f0-9]{32}$/i.test(salt)
}

export function verifyStaffPassword(password: string, encoded: string) {
  if (!isValidStaffPasswordHash(encoded)) return false
  try {
    const [, salt, digest] = encoded.split(':')
    const actual = scryptSync(password, salt, 64)
    const expected = Buffer.from(digest, 'hex')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

export function createStaffSessionToken(role: StaffRole, secret: string, now = Date.now()) {
  const payload = `${role}.${Math.floor(now / 1000) + SESSION_TTL_SECONDS}.${randomBytes(12).toString('base64url')}`
  const signature = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

export function readStaffRole(request: Request) {
  const secret = process.env.ASSISTLY_STAFF_SECRET
  if (!secret) return null
  const cookie = request.headers.get('cookie') ?? ''
  const token = cookie.match(/(?:^|; )assistly_staff_session=([^;]+)/)?.[1]
  if (!token) return null
  const [role, expires, nonce, signature] = token.split('.')
  if (!isStaffRole(role) || !expires || !nonce || !signature || Number(expires) < Math.floor(Date.now() / 1000)) return null
  const payload = `${role}.${expires}.${nonce}`
  const expected = createHmac('sha256', secret).update(payload).digest('base64url')
  const supplied = Buffer.from(signature)
  const valid = Buffer.from(expected)
  return supplied.length === valid.length && timingSafeEqual(supplied, valid) ? role : null
}

export function validateTicketId(id: unknown) { return typeof id === 'string' && /^(DEMO|TKT)-[A-Z0-9-]{3,64}$/i.test(id) }

export function createCustomerAccessToken(ticketId: string, secret: string) {
  const payload = `${ticketId}.${randomBytes(18).toString('base64url')}`
  const signature = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

export function verifyCustomerAccessToken(ticketId: string, token: string | null, secret: string) {
  if (!token) return false
  const [tokenTicketId, nonce, signature] = token.split('.')
  if (tokenTicketId !== ticketId || !nonce || !signature) return false
  const expected = createHmac('sha256', secret).update(`${tokenTicketId}.${nonce}`).digest('base64url')
  const supplied = Buffer.from(signature)
  const valid = Buffer.from(expected)
  return supplied.length === valid.length && timingSafeEqual(supplied, valid)
}
export function canMutateTickets(role: StaffRole | null) { return role !== null }
export function canResolveRisk(role: StaffRole | null, riskLevel: string) { return role !== null && (riskLevel === 'Low' || role === 'supervisor' || role === 'team_lead' || role === 'administrator') }

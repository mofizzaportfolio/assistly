import { describe, expect, it } from 'vitest'
import { canMutateTickets, canResolveRisk, createCustomerAccessToken, createStaffSessionToken, isStaffRole, isValidStaffPasswordHash, isValidStaffSecret, readStaffRole, validateTicketId, verifyCustomerAccessToken, verifyStaffPassword } from './ticket-security'

describe('ticket security', () => {
  it('rejects missing or unknown roles', () => {
    expect(isStaffRole(undefined)).toBe(false)
    expect(isStaffRole('customer')).toBe(false)
    expect(canMutateTickets(null)).toBe(false)
  })
  it('validates ticket identifiers', () => {
    expect(validateTicketId('DEMO-0001')).toBe(true)
    expect(validateTicketId('other-customer-ticket')).toBe(false)
    expect(validateTicketId('DROP TABLE tickets')).toBe(false)
  })
  it('signs staff sessions without placing the shared secret in the cookie', () => {
    const validSecret = 'test-secret-012345678901234567890'
    process.env.ASSISTLY_STAFF_SECRET = validSecret
    const token = createStaffSessionToken('support_agent', validSecret)
    expect(token).not.toContain(validSecret)
    expect(readStaffRole(new Request('http://localhost', { headers: { cookie: `assistly_staff_session=${token}; assistly_staff_role=support_agent` } }))).toBe('support_agent')
    expect(readStaffRole(new Request('http://localhost', { headers: { cookie: `assistly_staff_session=${token}x; assistly_staff_role=support_agent` } }))).toBeNull()
    const expired = createStaffSessionToken('support_agent', validSecret, Date.now() - (9 * 60 * 60 * 1000))
    expect(readStaffRole(new Request('http://localhost', { headers: { cookie: `assistly_staff_session=${expired}` } }))).toBeNull()
    process.env.ASSISTLY_STAFF_SECRET = 'short'
    expect(readStaffRole(new Request('http://localhost', { headers: { cookie: `assistly_staff_session=${token}` } }))).toBeNull()
    process.env.ASSISTLY_STAFF_SECRET = validSecret
  })
  it('isolates customer access tokens by ticket and secret', () => {
    const token = createCustomerAccessToken('TKT-ABC123', 'customer-secret')
    expect(verifyCustomerAccessToken('TKT-ABC123', token, 'customer-secret')).toBe(true)
    expect(verifyCustomerAccessToken('TKT-OTHER', token, 'customer-secret')).toBe(false)
    expect(verifyCustomerAccessToken('TKT-ABC123', token, 'wrong-secret')).toBe(false)
    expect(verifyCustomerAccessToken('TKT-ABC123', `${token}.extra`, 'customer-secret')).toBe(false)
  })
  it('validates staff configuration formats', () => {
    expect(isValidStaffSecret('short')).toBe(false)
    expect(isValidStaffSecret('a'.repeat(32))).toBe(true)
    expect(isValidStaffPasswordHash('scrypt:' + 'a'.repeat(32) + ':' + 'b'.repeat(128))).toBe(true)
  })
  it('rejects malformed password verifiers without throwing', () => {
    expect(isValidStaffPasswordHash('not-a-hash')).toBe(false)
    expect(verifyStaffPassword('password', 'scrypt:bad:bad')).toBe(false)
  })
  it('requires elevated staff approval for risky resolution', () => {
    expect(canResolveRisk('support_agent', 'Critical')).toBe(false)
    expect(canResolveRisk('supervisor', 'Critical')).toBe(true)
    expect(canResolveRisk('support_agent', 'Low')).toBe(true)
  })
})

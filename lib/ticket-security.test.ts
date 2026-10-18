import { describe, expect, it } from 'vitest'
import { canMutateTickets, canResolveRisk, createStaffSessionToken, isStaffRole, isValidStaffPasswordHash, readStaffRole, validateTicketId, verifyStaffPassword } from './ticket-security'

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
    process.env.ASSISTLY_STAFF_SECRET = 'test-secret'
    const token = createStaffSessionToken('support_agent', 'test-secret')
    expect(token).not.toContain('test-secret')
    expect(readStaffRole(new Request('http://localhost', { headers: { cookie: `assistly_staff_session=${token}; assistly_staff_role=support_agent` } }))).toBe('support_agent')
    expect(readStaffRole(new Request('http://localhost', { headers: { cookie: `assistly_staff_session=${token}x; assistly_staff_role=support_agent` } }))).toBeNull()
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

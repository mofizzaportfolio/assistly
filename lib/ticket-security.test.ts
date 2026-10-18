import { describe, expect, it } from 'vitest'
import { canMutateTickets, canResolveRisk, isStaffRole, validateTicketId } from './ticket-security'

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
  it('requires elevated staff approval for risky resolution', () => {
    expect(canResolveRisk('support_agent', 'Critical')).toBe(false)
    expect(canResolveRisk('supervisor', 'Critical')).toBe(true)
    expect(canResolveRisk('support_agent', 'Low')).toBe(true)
  })
})

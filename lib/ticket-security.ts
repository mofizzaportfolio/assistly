export const STAFF_ROLES = ['support_agent', 'technical_agent', 'supervisor', 'team_lead', 'administrator'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

export const TICKET_STATUSES = [
  'Open',
  'Awaiting approval',
  'Escalated',
  'Resolved',
  'Closed',
] as const

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === 'string' && (STAFF_ROLES as readonly string[]).includes(value)
}

export function readStaffRole(request: Request) {
  const role = request.headers.get('x-assistly-role')
  const configuredSecret = process.env.ASSISTLY_STAFF_SECRET
  const suppliedSecret = request.headers.get('x-assistly-staff-secret')
  const cookieHeader = request.headers.get('cookie') ?? ''
  const cookieSecret = cookieHeader.match(/(?:^|; )assistly_staff_session=([^;]+)/)?.[1]
  const cookieRole = cookieHeader.match(/(?:^|; )assistly_staff_role=([^;]+)/)?.[1]
  const authenticatedRole = role ?? cookieRole
  const authenticatedSecret = suppliedSecret ?? cookieSecret
  if (!configuredSecret || authenticatedSecret !== configuredSecret || !isStaffRole(authenticatedRole)) return null
  return authenticatedRole
}

export function validateTicketId(id: unknown) {
  return typeof id === 'string' && /^(DEMO|TKT)-[A-Z0-9-]{3,64}$/i.test(id)
}

export function canMutateTickets(role: StaffRole | null) {
  return role !== null
}

export function canResolveRisk(role: StaffRole | null, riskLevel: string) {
  return role !== null && (riskLevel === 'Low' || role === 'supervisor' || role === 'team_lead' || role === 'administrator')
}

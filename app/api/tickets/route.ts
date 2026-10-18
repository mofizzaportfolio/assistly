import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { supportAgents, ticketEvents, tickets } from '@/lib/db/schema'
import { canMutateTickets, canResolveRisk, createCustomerAccessToken, readStaffRole, TICKET_STATUSES, validateTicketId, verifyCustomerAccessToken } from '@/lib/ticket-security'

const publicFields = {
  id: tickets.id,
  subject: tickets.subject,
  customer: tickets.customer,
  originalMessage: tickets.originalMessage,
  category: tickets.category,
  tags: tickets.tags,
  priority: tickets.priority,
  riskLevel: tickets.riskLevel,
  status: tickets.status,
  channel: tickets.channel,
  team: tickets.team,
  assignee: tickets.assignee,
  isDemo: tickets.isDemo,
  resolutionSummary: tickets.resolutionSummary,
  createdAt: tickets.createdAt,
  updatedAt: tickets.updatedAt,
}

export async function POST(request: Request) {
  const secret = process.env.ASSISTLY_CUSTOMER_SECRET
  if (!secret) return NextResponse.json({ error: 'Customer access is not configured.' }, { status: 503 })
  const body = await request.json().catch(() => null) as { subject?: unknown; customer?: unknown; email?: unknown; message?: unknown } | null
  const subject = body?.subject
  const customer = body?.customer
  const email = body?.email
  const message = body?.message
  if (typeof subject !== 'string' || subject.trim().length < 3 || subject.length > 200 || typeof customer !== 'string' || customer.trim().length < 2 || customer.length > 120 || (email !== undefined && (typeof email !== 'string' || email.length > 320)) || typeof message !== 'string' || message.trim().length < 10 || message.length > 12000) return NextResponse.json({ error: 'Subject, name, and a detailed problem description are required.' }, { status: 400 })
  const id = `TKT-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`
  try {
    const ticket = await db.transaction(async transaction => {
      const [created] = await transaction.insert(tickets).values({ id, subject: subject.trim(), customer: customer.trim(), customerEmail: typeof email === 'string' ? email.trim().toLowerCase() : null, originalMessage: message.trim(), category: 'General Support', tags: [], priority: 'Medium', riskLevel: 'Low', status: 'Open', channel: 'web', team: 'Human Support', isDemo: false }).returning()
      await transaction.insert(ticketEvents).values({ ticketId: id, eventType: 'customer_message', actor: 'customer', visibility: 'public', body: message.trim(), metadata: { source: 'customer_portal' } })
      return created
    })
    const accessToken = createCustomerAccessToken(id, secret)
    const response = NextResponse.json({ ticket, accessToken }, { status: 201 })
    response.cookies.set('assistly_customer_access', `${id}.${accessToken}`, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24 * 30, path: '/' })
    return response
  } catch {
    return NextResponse.json({ error: 'Unable to create the ticket.' }, { status: 503 })
  }
}

export async function GET(request: Request) {
  const role = readStaffRole(request)
  const url = new URL(request.url)
  const requestedId = url.searchParams.get('id')
  if (!role && requestedId) {
    const secret = process.env.ASSISTLY_CUSTOMER_SECRET
    const token = request.headers.get('cookie')?.match(/(?:^|; )assistly_customer_access=([^;]+)/)?.[1]?.split('.').slice(1).join('.') ?? null
    if (!secret || !validateTicketId(requestedId) || !verifyCustomerAccessToken(requestedId, token, secret)) return NextResponse.json({ error: 'Customer access is required.' }, { status: 401 })
    try {
      const [ticket] = await db.select(publicFields).from(tickets).where(eq(tickets.id, requestedId)).limit(1)
      if (!ticket || ticket.isDemo) return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 })
      return NextResponse.json({ tickets: [ticket] })
    } catch { return NextResponse.json({ error: 'Ticket storage is unavailable.' }, { status: 503 }) }
  }
  if (!role) return NextResponse.json({ error: 'Authenticated staff access is required.' }, { status: 401 })
  try {
    const rows = await db.select(publicFields).from(tickets).where(eq(tickets.isDemo, true)).orderBy(asc(tickets.createdAt))
    const role = readStaffRole(request)
    if (!role) return NextResponse.json({ tickets: rows })
    const events = await db.select().from(ticketEvents).where(eq(ticketEvents.visibility, 'internal'))
    return NextResponse.json({ tickets: rows, internalEvents: events })
  } catch {
    return NextResponse.json({ error: 'Ticket storage is unavailable.' }, { status: 503 })
  }
}

export async function PATCH(request: Request) {
  const role = readStaffRole(request)
  if (!canMutateTickets(role)) return NextResponse.json({ error: 'Authenticated staff access is required.' }, { status: 401 })
  try {
    const body = await request.json() as { id?: unknown; status?: unknown; assignee?: unknown; team?: unknown; reason?: unknown }
    if (!validateTicketId(body.id)) return NextResponse.json({ error: 'A valid ticket id is required.' }, { status: 400 })
    if (body.status !== undefined && (typeof body.status !== 'string' || !TICKET_STATUSES.includes(body.status as typeof TICKET_STATUSES[number]))) return NextResponse.json({ error: 'Unknown ticket status.' }, { status: 400 })
    if (body.assignee !== undefined && (typeof body.assignee !== 'string' || body.assignee.length > 120)) return NextResponse.json({ error: 'Invalid assignee.' }, { status: 400 })
    if (body.team !== undefined && (body.team !== 'Human Support' && body.team !== 'Technical Team')) return NextResponse.json({ error: 'Invalid team.' }, { status: 400 })
    if (body.status === undefined && body.assignee === undefined && body.team === undefined) return NextResponse.json({ error: 'An update is required.' }, { status: 400 })

    const [current] = await db.select().from(tickets).where(eq(tickets.id, body.id as string)).limit(1)
    if (!current) return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 })
    if (body.status === 'Resolved' && !canResolveRisk(role, current.riskLevel)) return NextResponse.json({ error: 'This risk level requires supervisor approval.' }, { status: 403 })
    if (body.team === 'Technical Team' && current.team !== 'Technical Team' && !['support_agent', 'supervisor', 'team_lead', 'administrator'].includes(role ?? '')) return NextResponse.json({ error: 'Human Support must initiate technical escalation.' }, { status: 403 })
    if (body.team === 'Human Support' && current.team === 'Technical Team' && !['technical_agent', 'supervisor', 'team_lead', 'administrator'].includes(role ?? '')) return NextResponse.json({ error: 'Only Technical Team may return this ticket.' }, { status: 403 })
    if (body.team === 'Human Support' && current.team === 'Technical Team' && (typeof body.reason !== 'string' || body.reason.trim().length < 5)) return NextResponse.json({ error: 'A non-empty return explanation is required.' }, { status: 400 })
    if (body.assignee && body.assignee !== 'Unassigned') {
      const [agent] = await db.select({ id: supportAgents.id }).from(supportAgents).where(eq(supportAgents.name, body.assignee as string)).limit(1)
      if (!agent) return NextResponse.json({ error: 'Assignee is not in the support roster.' }, { status: 400 })
    }
    const patch = { ...(body.status !== undefined ? { status: body.status as string } : {}), ...(body.assignee !== undefined ? { assignee: body.assignee as string } : {}), ...(body.team !== undefined ? { team: body.team as string } : {}), updatedAt: new Date() }
    const idempotencyKey = request.headers.get('idempotency-key')?.trim() || null
    if (idempotencyKey && idempotencyKey.length > 200) return NextResponse.json({ error: 'The idempotency key is too long.' }, { status: 400 })
    if (idempotencyKey) {
      const [existing] = await db.select({ metadata: ticketEvents.metadata }).from(ticketEvents).where(and(eq(ticketEvents.ticketId, current.id), eq(ticketEvents.idempotencyKey, idempotencyKey))).limit(1)
      if (existing?.metadata && typeof existing.metadata === 'object' && 'ticket' in existing.metadata) return NextResponse.json({ ticket: (existing.metadata as { ticket: typeof current }).ticket, replayed: true })
    }
    const result = await db.transaction(async transaction => {
      const [ticket] = await transaction.update(tickets).set(patch).where(eq(tickets.id, body.id as string)).returning()
      await transaction.insert(ticketEvents).values({ ticketId: ticket.id, eventType: body.team && body.team !== current.team ? (body.team === 'Technical Team' ? 'escalation' : 'status_changed') : 'ticket_updated', actor: role, visibility: 'internal', body: typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'Staff ticket update', idempotencyKey, metadata: { patch, ticket, previousTeam: current.team, reason: body.reason ?? null } })
      return ticket
    })
    return NextResponse.json({ ticket: result })
  } catch {
    return NextResponse.json({ error: 'Ticket update failed.' }, { status: 503 })
  }
}

import { NextResponse } from 'next/server'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { supportAgents, ticketEvents, tickets } from '@/lib/db/schema'
import { canMutateTickets, canResolveRisk, readStaffRole, TICKET_STATUSES, validateTicketId } from '@/lib/ticket-security'

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

export async function GET(request: Request) {
  const role = readStaffRole(request)
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
    const body = await request.json() as { id?: unknown; status?: unknown; assignee?: unknown; team?: unknown }
    if (!validateTicketId(body.id)) return NextResponse.json({ error: 'A valid ticket id is required.' }, { status: 400 })
    if (body.status !== undefined && (typeof body.status !== 'string' || !TICKET_STATUSES.includes(body.status as typeof TICKET_STATUSES[number]))) return NextResponse.json({ error: 'Unknown ticket status.' }, { status: 400 })
    if (body.assignee !== undefined && (typeof body.assignee !== 'string' || body.assignee.length > 120)) return NextResponse.json({ error: 'Invalid assignee.' }, { status: 400 })
    if (body.team !== undefined && (body.team !== 'Human Support' && body.team !== 'Technical Team')) return NextResponse.json({ error: 'Invalid team.' }, { status: 400 })
    if (body.status === undefined && body.assignee === undefined && body.team === undefined) return NextResponse.json({ error: 'An update is required.' }, { status: 400 })

    const [current] = await db.select().from(tickets).where(eq(tickets.id, body.id as string)).limit(1)
    if (!current) return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 })
    if (body.status === 'Resolved' && !canResolveRisk(role, current.riskLevel)) return NextResponse.json({ error: 'This risk level requires supervisor approval.' }, { status: 403 })
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
      await transaction.insert(ticketEvents).values({ ticketId: ticket.id, eventType: 'ticket_updated', actor: role, visibility: 'internal', body: 'Staff ticket update', idempotencyKey, metadata: { patch, ticket } })
      return ticket
    })
    return NextResponse.json({ ticket: result })
  } catch {
    return NextResponse.json({ error: 'Ticket update failed.' }, { status: 503 })
  }
}

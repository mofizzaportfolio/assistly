import { and, asc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ticketEvents, tickets } from '@/lib/db/schema'
import { canMutateTickets, readStaffRole, validateTicketId } from '@/lib/ticket-security'

const PUBLIC_EVENTS = ['customer_message', 'public_reply', 'ai_analysis'] as const
const INTERNAL_EVENTS = ['private_note', 'assignment_changed', 'status_changed', 'escalation', 'technical_finding', 'audit'] as const

type EventType = (typeof PUBLIC_EVENTS)[number] | (typeof INTERNAL_EVENTS)[number]

function isEventType(value: unknown): value is EventType {
  return typeof value === 'string' && ([...PUBLIC_EVENTS, ...INTERNAL_EVENTS] as string[]).includes(value)
}

export async function GET(request: Request, { params }: { params: Promise<unknown> }) {
  const { id } = await params as { id: string }
  if (!validateTicketId(id)) return NextResponse.json({ error: 'Invalid ticket id.' }, { status: 400 })
  const role = readStaffRole(request)
  try {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1)
    if (!ticket) return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 })
    const events = await db.select({ id: ticketEvents.id, eventType: ticketEvents.eventType, actor: ticketEvents.actor, visibility: ticketEvents.visibility, body: ticketEvents.body, metadata: ticketEvents.metadata, createdAt: ticketEvents.createdAt }).from(ticketEvents).where(role ? eq(ticketEvents.ticketId, id) : and(eq(ticketEvents.ticketId, id), eq(ticketEvents.visibility, 'public'))).orderBy(asc(ticketEvents.createdAt))
    return NextResponse.json({ ticket, events })
  } catch {
    return NextResponse.json({ error: 'Ticket history is unavailable.' }, { status: 503 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<unknown> }) {
  const { id } = await params as { id: string }
  const role = readStaffRole(request)
  if (!canMutateTickets(role)) return NextResponse.json({ error: 'Authenticated staff access is required.' }, { status: 401 })
  const body = await request.json().catch(() => null) as { eventType?: unknown; body?: unknown; metadata?: unknown } | null
  const eventType = body?.eventType
  const message = body?.body
  if (!isEventType(eventType) || typeof message !== 'string' || message.trim().length < 1 || message.length > 8000) return NextResponse.json({ error: 'A valid event type and message are required.' }, { status: 400 })
  if (!validateTicketId(id)) return NextResponse.json({ error: 'Invalid ticket id.' }, { status: 400 })
  const idempotencyKey = request.headers.get('idempotency-key')?.trim() || null
  if (idempotencyKey && idempotencyKey.length > 200) return NextResponse.json({ error: 'The idempotency key is too long.' }, { status: 400 })
  const visibility = INTERNAL_EVENTS.includes(eventType as (typeof INTERNAL_EVENTS)[number]) ? 'internal' : 'public'
  try {
    const [ticket] = await db.select({ id: tickets.id }).from(tickets).where(eq(tickets.id, id)).limit(1)
    if (!ticket) return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 })
    if (idempotencyKey) {
      const [existing] = await db.select({ id: ticketEvents.id, body: ticketEvents.body, eventType: ticketEvents.eventType, visibility: ticketEvents.visibility, createdAt: ticketEvents.createdAt }).from(ticketEvents).where(and(eq(ticketEvents.ticketId, id), eq(ticketEvents.idempotencyKey, idempotencyKey))).limit(1)
      if (existing) return NextResponse.json({ event: existing, replayed: true })
    }
    const event = await db.transaction(async transaction => {
      const [created] = await transaction.insert(ticketEvents).values({ ticketId: id, eventType: eventType as string, actor: role as string, visibility, body: message.trim(), metadata: body?.metadata && typeof body.metadata === 'object' ? body.metadata as Record<string, unknown> : {}, idempotencyKey }).returning({ id: ticketEvents.id, eventType: ticketEvents.eventType, actor: ticketEvents.actor, visibility: ticketEvents.visibility, body: ticketEvents.body, metadata: ticketEvents.metadata, createdAt: ticketEvents.createdAt })
      await transaction.update(tickets).set({ updatedAt: new Date() }).where(eq(tickets.id, id))
      return created
    })
    return NextResponse.json({ event }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Unable to save ticket event.' }, { status: 503 })
  }
}

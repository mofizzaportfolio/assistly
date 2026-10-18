import { generateText, gateway } from 'ai'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ticketEvents, tickets } from '@/lib/db/schema'
import { and, desc, eq } from 'drizzle-orm'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { ticketId?: unknown; message?: unknown } | null
  if (typeof body?.message !== 'string' || body.message.trim().length < 3 || body.message.length > 8000) return NextResponse.json({ error: 'Describe the problem in 3–8000 characters.' }, { status: 400 })
  const ticketId = typeof body.ticketId === 'string' ? body.ticketId : null
  const idempotencyKey = request.headers.get('idempotency-key')?.trim() || null
  if (idempotencyKey && idempotencyKey.length > 200) return NextResponse.json({ error: 'The idempotency key is too long.' }, { status: 400 })
  try {
    if (ticketId && idempotencyKey) {
      const [existing] = await db.select({ body: ticketEvents.body }).from(ticketEvents).where(and(eq(ticketEvents.ticketId, ticketId), eq(ticketEvents.idempotencyKey, idempotencyKey))).orderBy(desc(ticketEvents.createdAt)).limit(1)
      if (existing?.body) return NextResponse.json({ answer: existing.body, provider: 'Vercel AI Gateway', replayed: true })
    }
    const ticket = ticketId ? (await db.select({ subject: tickets.subject, originalMessage: tickets.originalMessage, riskLevel: tickets.riskLevel }).from(tickets).where(eq(tickets.id, ticketId)).limit(1))[0] : null
    const result = await generateText({
      model: gateway('openai/gpt-4.1-mini'),
      system: 'You are Assistly support triage. Ask focused follow-up questions when context is missing. Give safe numbered troubleshooting steps, never request passwords or secrets, and recommend human review for security, billing, data loss, production outages, or high-risk situations. Be concise and transparent.',
      prompt: JSON.stringify({ ticket, customerMessage: body.message }),
    })
    if (ticketId) {
      try {
        await db.insert(ticketEvents).values({ ticketId, eventType: 'ai_analysis', actor: 'ai_assistant', visibility: 'public', body: result.text, idempotencyKey, metadata: { model: 'openai/gpt-4.1-mini' } })
      } catch (error) {
        if (!idempotencyKey) throw error
        const [existing] = await db.select({ body: ticketEvents.body }).from(ticketEvents).where(and(eq(ticketEvents.ticketId, ticketId), eq(ticketEvents.idempotencyKey, idempotencyKey))).limit(1)
        if (existing?.body) return NextResponse.json({ answer: existing.body, provider: 'Vercel AI Gateway', replayed: true })
        throw error
      }
    }
    return NextResponse.json({ answer: result.text, provider: 'Vercel AI Gateway' })
  } catch (error) {
    console.error('[v0] AI support request failed', error instanceof Error ? error.name : 'unknown_error')
    const configured = Boolean(process.env.AI_GATEWAY_API_KEY || process.env.API_KEY)
    return NextResponse.json({ error: configured ? 'The AI support provider is temporarily unavailable.' : 'AI support is not configured. Connect the Vercel AI Gateway integration.' }, { status: 503 })
  }
}

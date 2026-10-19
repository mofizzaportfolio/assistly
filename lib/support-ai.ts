import { and, desc, eq } from 'drizzle-orm'
import { generateText, gateway } from 'ai'
import { db } from '@/lib/db'
import { ticketEvents, tickets } from '@/lib/db/schema'
import { SUPPORT_AI_MODEL } from '@/lib/ai-config'

export async function generateSupportFirstResponse({ ticketId, message, idempotencyKey }: { ticketId: string; message: string; idempotencyKey: string | null }) {
  if (idempotencyKey) {
    const [existing] = await db.select({ body: ticketEvents.body }).from(ticketEvents).where(and(eq(ticketEvents.ticketId, ticketId), eq(ticketEvents.eventType, 'ai_analysis'), eq(ticketEvents.idempotencyKey, idempotencyKey))).orderBy(desc(ticketEvents.createdAt)).limit(1)
    if (existing?.body) return existing.body
  }
  const [ticket] = await db.select({ subject: tickets.subject, originalMessage: tickets.originalMessage, riskLevel: tickets.riskLevel }).from(tickets).where(eq(tickets.id, ticketId)).limit(1)
  if (!ticket) throw new Error('Ticket not found')
  const result = await generateText({
    model: gateway(SUPPORT_AI_MODEL),
    system: 'You are Assistly support triage. Ask focused follow-up questions when context is missing. Give safe numbered troubleshooting steps, never request passwords or secrets, and recommend human review for security, billing, data loss, production outages, or high-risk situations. Be concise and transparent.',
    prompt: JSON.stringify({ ticket, customerMessage: message }),
    abortSignal: AbortSignal.timeout(15_000),
  })
  const answer = result.text.trim()
  if (!answer) throw new Error('AI provider returned an empty response')
  try {
    await db.insert(ticketEvents).values({ ticketId, eventType: 'ai_analysis', actor: 'ai_assistant', visibility: 'public', body: answer, idempotencyKey, metadata: { model: SUPPORT_AI_MODEL } })
  } catch (error) {
    if (!idempotencyKey) throw error
    const [existing] = await db.select({ body: ticketEvents.body }).from(ticketEvents).where(and(eq(ticketEvents.ticketId, ticketId), eq(ticketEvents.eventType, 'ai_analysis'), eq(ticketEvents.idempotencyKey, idempotencyKey))).limit(1)
    if (existing?.body) return existing.body
    throw error
  }
  return answer
}

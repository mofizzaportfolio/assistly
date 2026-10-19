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
  const requestId = crypto.randomUUID()
  let result
  try {
    result = await generateText({
    model: gateway(SUPPORT_AI_MODEL),
    system: 'You are Assistly support triage. Ask focused follow-up questions when context is missing. Give safe numbered troubleshooting steps, never request passwords or secrets, and recommend human review for security, billing, data loss, production outages, or high-risk situations. Be concise and transparent.',
    prompt: JSON.stringify({ ticket, customerMessage: message }),
    abortSignal: AbortSignal.timeout(15_000),
    })
  } catch (error) {
    const candidate = error as { statusCode?: unknown; responseHeaders?: Headers | Record<string, string>; name?: unknown }
    const status = typeof candidate.statusCode === 'number' ? candidate.statusCode : undefined
    const headers = candidate.responseHeaders instanceof Headers ? candidate.responseHeaders : new Headers(candidate.responseHeaders)
    const upstreamRequestId = headers.get('x-request-id') ?? headers.get('request-id') ?? undefined
    const category = error instanceof DOMException && error.name === 'TimeoutError' ? 'timeout' : candidate.name === 'GatewayAuthenticationError' ? 'authentication' : candidate.name === 'GatewayRateLimitError' ? 'rate_limit' : candidate.name === 'GatewayInternalServerError' ? 'gateway_internal' : 'provider_error'
    console.error('[assistly.ai]', JSON.stringify({ status, category, requestId, upstreamRequestId, model: SUPPORT_AI_MODEL }))
    throw error
  }
  const answer = result.text.trim()
  if (!answer) throw new Error('AI provider returned an empty response')
  try {
    await db.insert(ticketEvents).values({ ticketId, eventType: 'ai_analysis', actor: 'ai_assistant', visibility: 'public', body: answer, idempotencyKey, metadata: { model: SUPPORT_AI_MODEL } })
  } catch (error) {
    const candidate = error as { code?: unknown; name?: unknown; constructor?: { name?: unknown } }
    const errorName = typeof candidate.name === 'string' ? candidate.name : typeof candidate.constructor?.name === 'string' ? candidate.constructor.name : 'UnknownError'
    const errorCode = typeof candidate.code === 'string' && /^[A-Z0-9_:-]{1,40}$/.test(candidate.code) ? candidate.code : undefined
    console.error('[assistly.ai]', JSON.stringify({ category: 'persistence', eventType: 'ai_analysis', requestId, errorName, errorCode }))
    if (!idempotencyKey) throw error
    const [existing] = await db.select({ body: ticketEvents.body }).from(ticketEvents).where(and(eq(ticketEvents.ticketId, ticketId), eq(ticketEvents.eventType, 'ai_analysis'), eq(ticketEvents.idempotencyKey, idempotencyKey))).limit(1)
    if (existing?.body) return existing.body
    throw error
  }
  return answer
}

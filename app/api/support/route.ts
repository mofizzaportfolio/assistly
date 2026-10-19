import { generateText, gateway } from 'ai'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ticketEvents, tickets } from '@/lib/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import { getSupportAiConfig, SUPPORT_AI_MODEL } from '@/lib/ai-config'
import { generateSupportFirstResponse } from '@/lib/support-ai'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { ticketId?: unknown; message?: unknown } | null
  if (typeof body?.message !== 'string' || body.message.trim().length < 3 || body.message.length > 8000) return NextResponse.json({ error: 'Describe the problem in 3–8000 characters.' }, { status: 400 })
  const ticketId = typeof body.ticketId === 'string' ? body.ticketId : null
  const idempotencyKey = request.headers.get('idempotency-key')?.trim() || null
  if (idempotencyKey && idempotencyKey.length > 200) return NextResponse.json({ error: 'The idempotency key is too long.' }, { status: 400 })
  try {
    if (ticketId && idempotencyKey) {
      const [existing] = await db.select({ body: ticketEvents.body, eventType: ticketEvents.eventType }).from(ticketEvents).where(and(eq(ticketEvents.ticketId, ticketId), eq(ticketEvents.eventType, 'ai_analysis'), eq(ticketEvents.idempotencyKey, idempotencyKey))).orderBy(desc(ticketEvents.createdAt)).limit(1)
      if (existing?.body) return NextResponse.json({ answer: existing.body, provider: 'Vercel AI Gateway', replayed: true })
    }
    if (!ticketId) {
      const requestId = crypto.randomUUID()
      let result
      try {
        result = await generateText({ model: gateway(SUPPORT_AI_MODEL), system: 'You are Assistly support triage. Ask focused follow-up questions when context is missing. Give safe numbered troubleshooting steps, never request passwords or secrets, and recommend human review for security, billing, data loss, production outages, or high-risk situations. Be concise and transparent.', prompt: JSON.stringify({ customerMessage: body.message }), abortSignal: AbortSignal.timeout(15_000) })
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
      return NextResponse.json({ answer, provider: 'Vercel AI Gateway' })
    }
    const answer = await generateSupportFirstResponse({ ticketId, message: body.message, idempotencyKey })
    return NextResponse.json({ answer, provider: 'Vercel AI Gateway' })
  } catch (error) {
    console.error('[v0] AI support request failed', error instanceof Error ? error.name : 'unknown_error')
    const configured = getSupportAiConfig().configured
    return NextResponse.json({ error: configured ? 'The AI support provider is temporarily unavailable.' : 'AI support is not configured. Connect the Vercel AI Gateway integration.' }, { status: 503 })
  }
}

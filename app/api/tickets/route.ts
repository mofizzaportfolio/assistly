import { NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tickets } from '@/lib/db/schema'

export async function GET() {
  try {
    const rows = await db.select().from(tickets).where(eq(tickets.isDemo, true)).orderBy(asc(tickets.createdAt))
    return NextResponse.json({ tickets: rows })
  } catch {
    return NextResponse.json({ error: 'Ticket storage is unavailable.' }, { status: 503 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as { id?: string; status?: string; assignee?: string; team?: string }
    if (!body.id || (!body.status && !body.assignee && !body.team)) return NextResponse.json({ error: 'A ticket id and update are required.' }, { status: 400 })
    const patch = { ...(body.status ? { status: body.status } : {}), ...(body.assignee ? { assignee: body.assignee } : {}), ...(body.team ? { team: body.team } : {}), updatedAt: new Date() }
    const [ticket] = await db.update(tickets).set(patch).where(eq(tickets.id, body.id)).returning()
    if (!ticket) return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 })
    return NextResponse.json({ ticket })
  } catch {
    return NextResponse.json({ error: 'Ticket update failed.' }, { status: 503 })
  }
}

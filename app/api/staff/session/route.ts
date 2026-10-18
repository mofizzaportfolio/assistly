import { NextResponse } from 'next/server'
import { isStaffRole, STAFF_ROLES } from '@/lib/ticket-security'

export async function POST(request: Request) {
  const configuredSecret = process.env.ASSISTLY_STAFF_SECRET
  if (!configuredSecret) return NextResponse.json({ error: 'ASSISTLY_STAFF_SECRET is not configured.' }, { status: 503 })
  const body = await request.json().catch(() => null) as { secret?: unknown; role?: unknown } | null
  if (body?.secret !== configuredSecret || !isStaffRole(body.role)) return NextResponse.json({ error: 'Invalid staff credentials.' }, { status: 401 })
  const response = NextResponse.json({ authenticated: true, role: body.role })
  response.cookies.set('assistly_staff_role', body.role, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 8 })
  response.cookies.set('assistly_staff_session', configuredSecret, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 8 })
  return response
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false })
  response.cookies.delete('assistly_staff_role')
  response.cookies.delete('assistly_staff_session')
  return response
}

export async function GET(request: Request) {
  const role = request.headers.get('x-assistly-role')
  return NextResponse.json({ authenticated: isStaffRole(role), roles: STAFF_ROLES })
}

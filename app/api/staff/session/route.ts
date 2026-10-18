import { NextResponse } from 'next/server'
import { createStaffSessionToken, isStaffRole, isValidStaffPasswordHash, isValidStaffSecret, readStaffRole, STAFF_ROLES, verifyStaffPassword } from '@/lib/ticket-security'

export async function POST(request: Request) {
  const secret = process.env.ASSISTLY_STAFF_SECRET
  const passwordHash = process.env.ASSISTLY_STAFF_PASSWORD_HASH
  if (!isValidStaffSecret(secret) || !isValidStaffPasswordHash(passwordHash)) return NextResponse.json({ error: 'Staff authentication is not configured correctly.' }, { status: 503 })
  const body = await request.json().catch(() => null) as { password?: unknown; role?: unknown } | null
  if (typeof body?.password !== 'string' || !isStaffRole(body.role) || !verifyStaffPassword(body.password, passwordHash)) return NextResponse.json({ error: 'Invalid staff credentials.' }, { status: 401 })
  const response = NextResponse.json({ authenticated: true, role: body.role })
  response.cookies.set('assistly_staff_session', createStaffSessionToken(body.role, secret), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 8 })
  return response
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false })
  response.cookies.set('assistly_staff_session', '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 })
  return response
}

export async function GET(request: Request) {
  const role = readStaffRole(request)
  return NextResponse.json({ authenticated: Boolean(role), role, roles: STAFF_ROLES })
}

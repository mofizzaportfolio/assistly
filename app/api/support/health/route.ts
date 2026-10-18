import { NextResponse } from 'next/server'
import { publicSupportAiDiagnostics } from '@/lib/ai-config'

export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json(publicSupportAiDiagnostics())
}

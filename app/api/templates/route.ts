import { NextResponse, type NextRequest } from 'next/server'
import { errorResponse } from '@/lib/api/handler'
import { createClient } from '@/lib/supabase/server'
import { listTemplates } from '@/lib/core/services/template-service'

export const dynamic = 'force-dynamic'

const CATEGORIES = new Set(['support', 'sales', 'ops', 'research', 'content', 'hr', 'voice', 'other'])

/** Public: published templates. */
export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID()
  try {
    const category = req.nextUrl.searchParams.get('category') ?? undefined
    const result = await listTemplates(createClient(), category && CATEGORIES.has(category) ? category : undefined)
    return NextResponse.json(result, { headers: { 'Cache-Control': 'public, max-age=60' } })
  } catch (e) {
    return errorResponse(e, requestId)
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getRecentCycleSummaries, getCycleSummary } from '@/lib/agents/cycle/cycle-summary';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('companyId');
  const cycleId = searchParams.get('cycleId');
  const limit = parseInt(searchParams.get('limit') || '10', 10);

  if (!companyId) {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 });
  }

  const supabase = await createClient();

  // If cycleId provided, get specific cycle summary
  if (cycleId) {
    const summary = await getCycleSummary(cycleId, supabase);
    return NextResponse.json({ summary });
  }

  // Otherwise, get recent summaries
  const summaries = await getRecentCycleSummaries(companyId, limit, supabase);

  return NextResponse.json({ summaries });
}

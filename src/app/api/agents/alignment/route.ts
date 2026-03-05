import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAlignmentReport, getUnresolvedConflicts } from '@/lib/agents/alignment';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('companyId');
  const cycleId = searchParams.get('cycleId');

  if (!companyId) {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 });
  }

  const supabase = await createClient();

  // If cycleId provided, get specific cycle's alignment
  if (cycleId) {
    const report = await getAlignmentReport(cycleId, supabase);
    return NextResponse.json(report || { overallScore: 0, agentAlignment: [], conflicts: [], suggestions: [] });
  }

  // Otherwise, get the most recent alignment report
  const { data: latestCycle } = await supabase
    .from('operating_cycles')
    .select('id')
    .eq('company_id', companyId)
    .eq('status', 'done')
    .order('completed_at', { ascending: false })
    .limit(1)
    .single();

  if (!latestCycle) {
    return NextResponse.json({
      overallScore: 100,
      agentAlignment: [],
      conflicts: [],
      suggestions: [],
    });
  }

  const report = await getAlignmentReport(latestCycle.id, supabase);

  // Get any unresolved conflicts across all cycles
  const unresolvedConflicts = await getUnresolvedConflicts(companyId, supabase);

  return NextResponse.json({
    overallScore: report?.overallScore || 100,
    agentAlignment: report?.agentAlignment || [],
    conflicts: unresolvedConflicts,
    suggestions: report?.suggestions || [],
  });
}

import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const agentRole = searchParams.get('agentRole');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

    if (!companyId) {
      return new Response(JSON.stringify({ error: 'Missing companyId' }), { status: 400 });
    }

    // Verify ownership
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .eq('user_id', user.id)
      .single();

    if (!company) {
      return new Response(JSON.stringify({ error: 'Company not found' }), { status: 404 });
    }

    let query = supabase
      .from('agent_performance')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (agentRole) query = query.eq('agent_role', agentRole);

    const { data, error } = await query;
    if (error) throw error;

    // Calculate trends
    const records = data || [];
    const byAgent = new Map<string, number[]>();
    for (const r of records) {
      const scores = byAgent.get(r.agent_role) || [];
      scores.push(r.score);
      byAgent.set(r.agent_role, scores);
    }

    const trends: Record<string, string> = {};
    for (const [role, scores] of byAgent) {
      if (scores.length < 2) {
        trends[role] = 'stable';
        continue;
      }
      const mid = Math.floor(scores.length / 2);
      const olderAvg = scores.slice(mid).reduce((a, b) => a + b, 0) / (scores.length - mid);
      const newerAvg = scores.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
      const diff = newerAvg - olderAvg;
      trends[role] = diff > 5 ? 'improving' : diff < -5 ? 'declining' : 'stable';
    }

    return new Response(JSON.stringify({ performance: records, trends }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Performance route error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}

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
    const tier = searchParams.get('tier') || 'short';
    const agentRole = searchParams.get('agentRole');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

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

    if (tier === 'long') {
      let query = supabase
        .from('agent_memory_long_term')
        .select('*')
        .eq('company_id', companyId)
        .order('last_referenced_at', { ascending: false })
        .limit(limit);

      if (agentRole) query = query.eq('agent_role', agentRole);

      const { data, error } = await query;
      if (error) throw error;

      return new Response(JSON.stringify({ memories: data || [], tier: 'long' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      let query = supabase
        .from('agent_memory_short_term')
        .select('*')
        .eq('company_id', companyId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(limit);

      if (agentRole) query = query.eq('agent_role', agentRole);

      const { data, error } = await query;
      if (error) throw error;

      return new Response(JSON.stringify({ memories: data || [], tier: 'short' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('Memory route error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}

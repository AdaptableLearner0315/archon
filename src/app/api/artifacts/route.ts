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
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50);

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

    const { data: artifacts, error } = await supabase
      .from('artifacts')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return new Response(JSON.stringify({ artifacts: artifacts || [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Artifacts GET error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}

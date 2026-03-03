import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const { id } = await params;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return new Response(JSON.stringify({ error: 'Invalid cycle ID' }), { status: 400 });
    }

    const { data: cycle, error } = await supabase
      .from('operating_cycles')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !cycle) {
      return new Response(JSON.stringify({ error: 'Cycle not found' }), { status: 404 });
    }

    const { data: tasks } = await supabase
      .from('cycle_tasks')
      .select('*')
      .eq('cycle_id', id)
      .order('created_at', { ascending: true });

    const { data: messages } = await supabase
      .from('agent_messages')
      .select('*')
      .eq('cycle_id', id)
      .order('created_at', { ascending: true });

    return new Response(JSON.stringify({
      cycle,
      tasks: tasks || [],
      messages: messages || [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Cycle detail error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}

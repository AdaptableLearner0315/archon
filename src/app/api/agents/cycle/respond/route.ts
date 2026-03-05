import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const body = await request.json();
    const { taskId, response } = body;

    if (!taskId || !response) {
      return new Response(JSON.stringify({ error: 'Missing taskId or response' }), { status: 400 });
    }

    // Fetch the task and verify ownership
    const { data: task, error: taskError } = await supabase
      .from('cycle_tasks')
      .select('*, operating_cycles!inner(company_id, status)')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      return new Response(JSON.stringify({ error: 'Task not found' }), { status: 404 });
    }

    const companyId = task.operating_cycles.company_id;

    // Verify user owns this company
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .eq('user_id', user.id)
      .single();

    if (!company) {
      return new Response(JSON.stringify({ error: 'Not authorized for this company' }), { status: 403 });
    }

    if (!task.needs_human_input) {
      return new Response(JSON.stringify({ error: 'Task is not waiting for human input' }), { status: 400 });
    }

    if (task.human_input_response) {
      return new Response(JSON.stringify({ error: 'Task already has a response' }), { status: 400 });
    }

    // Update the task with the human response
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('cycle_tasks')
      .update({
        human_input_response: response,
        human_input_responded_at: now,
        status: 'pending', // Re-queue for execution
      })
      .eq('id', taskId);

    if (updateError) {
      throw updateError;
    }

    // Mark any associated notification as read
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('task_id', taskId)
      .eq('type', 'nudge');

    return new Response(JSON.stringify({
      success: true,
      taskId,
      respondedAt: now,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Respond API error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Resend inbound email webhook payload
    const { type, data } = body;

    // Only handle inbound emails
    if (type !== 'email.received') {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    const { from, to, text, subject } = data || {};

    if (!from || !text) {
      return new Response(JSON.stringify({ error: 'Missing from or text' }), { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Match sender email to company via notification preferences
    const senderEmail = typeof from === 'string' ? from : from?.address || from?.[0]?.address;
    if (!senderEmail) {
      return new Response(JSON.stringify({ error: 'Cannot parse sender' }), { status: 400 });
    }

    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('company_id')
      .eq('email_address', senderEmail)
      .eq('email_enabled', true)
      .single();

    if (!prefs) {
      return new Response(JSON.stringify({ error: 'No account linked to this email' }), { status: 200 });
    }

    // Find most recent task needing human input
    const { data: task } = await supabase
      .from('cycle_tasks')
      .select('id, agent_role, agent_name')
      .eq('company_id', prefs.company_id)
      .eq('needs_human_input', true)
      .is('human_input_response', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!task) {
      return new Response(JSON.stringify({ ok: true, message: 'No pending questions' }), { status: 200 });
    }

    // Clean reply text — strip quoted/forwarded content
    const cleanReply = extractReplyText(typeof text === 'string' ? text : '');

    if (!cleanReply) {
      return new Response(JSON.stringify({ ok: true, message: 'Empty reply' }), { status: 200 });
    }

    // Update the task
    const now = new Date().toISOString();
    await supabase
      .from('cycle_tasks')
      .update({
        human_input_response: cleanReply,
        human_input_responded_at: now,
        status: 'pending',
      })
      .eq('id', task.id);

    // Mark notification as read
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('task_id', task.id)
      .eq('type', 'nudge');

    return new Response(JSON.stringify({ ok: true, taskId: task.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Resend webhook error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}

function extractReplyText(text: string): string {
  // Strip common reply markers
  const markers = [
    /^On .+ wrote:$/m,
    /^-{2,}\s*Original Message\s*-{2,}/m,
    /^>{1,}/m,
    /^From:/m,
    /^Sent:/m,
  ];

  let cleaned = text;
  for (const marker of markers) {
    const match = marker.exec(cleaned);
    if (match) {
      cleaned = cleaned.slice(0, match.index);
    }
  }

  return cleaned.trim();
}

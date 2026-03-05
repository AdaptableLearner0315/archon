import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const body = formData.get('Body')?.toString().trim();
    const from = formData.get('From')?.toString();

    if (!body || !from) {
      return new Response('<Response><Message>Invalid request</Message></Response>', {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // Strip "whatsapp:" prefix
    const phoneNumber = from.replace('whatsapp:', '');

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Look up company by WhatsApp number
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('company_id')
      .eq('whatsapp_number', phoneNumber)
      .eq('whatsapp_enabled', true)
      .single();

    if (!prefs) {
      return new Response('<Response><Message>No account linked to this number.</Message></Response>', {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // Find most recent task needing human input for this company
    const { data: task } = await supabase
      .from('cycle_tasks')
      .select('id, agent_role, agent_name, human_input_question')
      .eq('company_id', prefs.company_id)
      .eq('needs_human_input', true)
      .is('human_input_response', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!task) {
      return new Response('<Response><Message>No pending questions from your agents right now.</Message></Response>', {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // Update the task with the human response
    const now = new Date().toISOString();
    await supabase
      .from('cycle_tasks')
      .update({
        human_input_response: body,
        human_input_responded_at: now,
        status: 'pending',
      })
      .eq('id', task.id);

    // Mark any associated notification as read
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('task_id', task.id)
      .eq('type', 'nudge');

    return new Response(
      `<Response><Message>Got it! ${task.agent_name} will continue with your input.</Message></Response>`,
      {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      }
    );
  } catch (error) {
    console.error('Twilio webhook error:', error);
    return new Response('<Response><Message>Something went wrong. Please try again.</Message></Response>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}

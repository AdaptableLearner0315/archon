import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

function verifySlackSignature(request: NextRequest, rawBody: string): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) return false;

  const timestamp = request.headers.get('x-slack-request-timestamp');
  const slackSignature = request.headers.get('x-slack-signature');

  if (!timestamp || !slackSignature) return false;

  // Prevent replay attacks (5 min window)
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const sigBasestring = `v0:${timestamp}:${rawBody}`;
  const mySignature = 'v0=' + crypto.createHmac('sha256', signingSecret).update(sigBasestring).digest('hex');

  return crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(slackSignature));
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    // Handle Slack URL verification challenge
    try {
      const parsed = JSON.parse(rawBody);
      if (parsed.type === 'url_verification') {
        return new Response(JSON.stringify({ challenge: parsed.challenge }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch {
      // Not JSON — likely URL-encoded payload
    }

    // Verify signature
    if (process.env.SLACK_SIGNING_SECRET && !verifySlackSignature(request, rawBody)) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401 });
    }

    // Parse interactive payload (URL-encoded)
    const params = new URLSearchParams(rawBody);
    const payloadStr = params.get('payload');
    if (!payloadStr) {
      return new Response(JSON.stringify({ error: 'Missing payload' }), { status: 400 });
    }

    const payload = JSON.parse(payloadStr);

    // Handle button clicks (interactive messages)
    if (payload.type === 'block_actions' && payload.actions?.length > 0) {
      const action = payload.actions[0];
      const taskId = action.value;

      if (!taskId) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      // If this is a text input response (from a modal), handle it
      if (action.type === 'plain_text_input') {
        const response = action.value;
        if (response) {
          await handleResponse(taskId, response);
        }
      }

      // For button clicks, update the message to show acknowledged
      return new Response(JSON.stringify({
        replace_original: true,
        text: `Response received for task. View details in the Archon dashboard.`,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Handle view submissions (from modals with text input)
    if (payload.type === 'view_submission') {
      const values = payload.view?.state?.values;
      if (values) {
        const firstBlock = Object.values(values)[0] as Record<string, { value?: string }>;
        const firstAction = Object.values(firstBlock)[0];
        const taskId = payload.view?.private_metadata;
        const response = firstAction?.value;

        if (taskId && response) {
          await handleResponse(taskId, response);
        }
      }
      return new Response(JSON.stringify({ response_action: 'clear' }), { status: 200 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (error) {
    console.error('Slack webhook error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}

async function handleResponse(taskId: string, response: string): Promise<void> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date().toISOString();

  await supabase
    .from('cycle_tasks')
    .update({
      human_input_response: response,
      human_input_responded_at: now,
      status: 'pending',
    })
    .eq('id', taskId)
    .eq('needs_human_input', true)
    .is('human_input_response', null);

  await supabase
    .from('notifications')
    .update({ read: true })
    .eq('task_id', taskId)
    .eq('type', 'nudge');
}

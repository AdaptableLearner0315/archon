import type { SupabaseClient } from '@supabase/supabase-js';
import { AGENT_NAMES } from '../engine';
import type { AgentRole } from '../../types';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://archon.app';

export async function sendNudge(
  companyId: string,
  taskId: string,
  agentRole: AgentRole,
  question: string,
  supabase: SupabaseClient
): Promise<void> {
  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('company_id', companyId)
    .single();

  if (!prefs) return;

  const { data: company } = await supabase
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .single();

  const companyName = company?.name || 'Your company';
  const agentName = AGENT_NAMES[agentRole] || agentRole;
  const respondUrl = `${APP_URL}/dashboard?action=respond&taskId=${taskId}`;

  // 1. Webapp notification (always, unless explicitly disabled)
  if (prefs.webapp_enabled !== false) {
    try {
      await supabase.from('notifications').insert({
        company_id: companyId,
        type: 'nudge',
        title: `${agentName} needs your input`,
        body: question,
        action_url: respondUrl,
        task_id: taskId,
      });
    } catch (err) {
      console.error('Failed to insert nudge notification:', err);
    }
  }

  // 2. Email via Resend
  if (prefs.email_enabled && prefs.email_address && process.env.RESEND_API_KEY) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL || 'Archon <noreply@archon.app>',
          to: prefs.email_address,
          subject: `[Archon] ${agentName} needs your input — ${companyName}`,
          html: buildNudgeEmail(agentName, question, respondUrl, companyName),
        }),
      });
    } catch (err) {
      console.error('Failed to send nudge email:', err);
    }
  }

  // 3. WhatsApp via Twilio
  if (prefs.whatsapp_enabled && prefs.whatsapp_number && process.env.TWILIO_ACCOUNT_SID) {
    try {
      const twilioAuth = Buffer.from(
        `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
      ).toString('base64');

      const text = [
        `Archon — ${companyName}`,
        '',
        `${agentName} is blocked and needs your input:`,
        '',
        question,
        '',
        'Reply to this message to unblock the agent.',
      ].join('\n');

      await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${twilioAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            From: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM || '+14155238886'}`,
            To: `whatsapp:${prefs.whatsapp_number}`,
            Body: text,
          }),
        }
      );
    } catch (err) {
      console.error('Failed to send nudge WhatsApp:', err);
    }
  }

  // 4. Slack via webhook
  if (prefs.slack_enabled && prefs.slack_webhook_url) {
    try {
      await fetch(prefs.slack_webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `${agentName} needs your input — ${companyName}`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `:warning: *${agentName}* is blocked and needs your input:\n\n> ${question}`,
              },
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: 'Respond in Dashboard' },
                  url: respondUrl,
                  style: 'danger',
                  action_id: `respond_${taskId}`,
                  value: taskId,
                },
              ],
            },
          ],
        }),
      });
    } catch (err) {
      console.error('Failed to send nudge Slack:', err);
    }
  }
}

function buildNudgeEmail(agentName: string, question: string, respondUrl: string, companyName: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16162a 100%); border-radius: 12px; padding: 32px; border: 1px solid #2d2d3d;">
      <h1 style="color: #fbbf24; margin: 0 0 8px 0; font-size: 20px;">${agentName} needs your input</h1>
      <p style="color: #9ca3af; margin: 0 0 24px 0; font-size: 14px;">${companyName}</p>

      <div style="background: #1a1a0f; border-radius: 8px; padding: 16px; margin-bottom: 20px; border: 1px solid #3d3d2d;">
        <p style="color: #d1d5db; margin: 0; font-size: 14px; line-height: 1.6;">${question}</p>
      </div>

      <a href="${respondUrl}"
         style="display: inline-block; background: #d97706; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600;">
        Respond Now
      </a>

      <p style="color: #6b7280; font-size: 12px; margin-top: 16px;">
        You can also reply to this email to unblock the agent.
      </p>
    </div>
  </div>
</body>
</html>`;
}

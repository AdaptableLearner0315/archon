import type { SupabaseClient } from '@supabase/supabase-js';
import type { CycleTask, OperatingCycle } from '../../types';
import { AGENT_NAMES } from '../engine';

interface DigestData {
  cycle: OperatingCycle;
  tasks: CycleTask[];
  companyName: string;
}

export async function generateDigestHtml(data: DigestData): Promise<string> {
  const { cycle, tasks, companyName } = data;
  const date = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const failedTasks = tasks.filter((t) => t.status === 'failed' || t.status === 'blocked');

  const agentHighlights = completedTasks.map((t) => {
    const name = AGENT_NAMES[t.agentRole] || t.agentRole;
    const summary = t.result?.slice(0, 150) || 'Task completed';
    return `<tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #2d2d3d; color: #a78bfa; font-weight: 600;">${name}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #2d2d3d; color: #d1d5db;">${summary}...</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16162a 100%); border-radius: 12px; padding: 32px; border: 1px solid #2d2d3d;">
      <h1 style="color: #a78bfa; margin: 0 0 8px 0; font-size: 24px;">Archon Daily Update</h1>
      <p style="color: #9ca3af; margin: 0 0 24px 0; font-size: 14px;">${companyName} — ${date}</p>

      <div style="background: #0f0f1a; border-radius: 8px; padding: 16px; margin-bottom: 20px; border: 1px solid #2d2d3d;">
        <h2 style="color: #e5e7eb; margin: 0 0 8px 0; font-size: 16px;">Cycle Summary</h2>
        <p style="color: #d1d5db; margin: 0; font-size: 14px;">${cycle.plan?.directive || 'Automated cycle'}</p>
        <div style="margin-top: 12px;">
          <span style="color: #34d399; font-size: 14px;">${completedTasks.length} completed</span>
          ${failedTasks.length > 0 ? `<span style="color: #f87171; font-size: 14px; margin-left: 16px;">${failedTasks.length} failed</span>` : ''}
          <span style="color: #9ca3af; font-size: 14px; margin-left: 16px;">$${cycle.totalCostUsd.toFixed(4)}</span>
        </div>
      </div>

      ${completedTasks.length > 0 ? `
      <h2 style="color: #e5e7eb; margin: 0 0 12px 0; font-size: 16px;">Agent Highlights</h2>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        ${agentHighlights}
      </table>
      ` : ''}

      ${failedTasks.length > 0 ? `
      <div style="background: #1a0f0f; border-radius: 8px; padding: 16px; margin-bottom: 20px; border: 1px solid #3d2d2d;">
        <h2 style="color: #f87171; margin: 0 0 8px 0; font-size: 16px;">Issues</h2>
        ${failedTasks.map((t) => `<p style="color: #d1d5db; margin: 4px 0; font-size: 13px;">${AGENT_NAMES[t.agentRole]}: ${t.error || 'Failed'}</p>`).join('')}
      </div>
      ` : ''}

      <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://archon.app'}/dashboard"
         style="display: inline-block; background: #6d28d9; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600;">
        View Dashboard
      </a>
    </div>
    <p style="color: #6b7280; font-size: 12px; text-align: center; margin-top: 16px;">
      Powered by Archon — The 1-Person Unicorn Engine
    </p>
  </div>
</body>
</html>`;
}

export function generateDigestText(data: DigestData): string {
  const { cycle, tasks, companyName } = data;
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const failedTasks = tasks.filter((t) => t.status === 'failed' || t.status === 'blocked');

  const lines = [
    `Archon Daily Update — ${companyName}`,
    '',
    `Cycle: ${cycle.plan?.directive || 'Automated cycle'}`,
    `${completedTasks.length} completed | ${failedTasks.length} failed | $${cycle.totalCostUsd.toFixed(4)}`,
    '',
  ];

  for (const t of completedTasks) {
    lines.push(`- ${AGENT_NAMES[t.agentRole]}: ${t.result?.slice(0, 100) || 'Done'}`);
  }

  if (failedTasks.length > 0) {
    lines.push('', 'Issues:');
    for (const t of failedTasks) {
      lines.push(`- ${AGENT_NAMES[t.agentRole]}: ${t.error || 'Failed'}`);
    }
  }

  lines.push('', `Dashboard: ${process.env.NEXT_PUBLIC_APP_URL || 'https://archon.app'}/dashboard`);

  return lines.join('\n');
}

export async function sendDailyDigest(
  cycleId: string,
  companyId: string,
  supabase: SupabaseClient
): Promise<void> {
  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('company_id', companyId)
    .single();

  if (!prefs) return;

  const [{ data: cycle }, { data: tasks }, { data: company }] = await Promise.all([
    supabase.from('operating_cycles').select('*').eq('id', cycleId).single(),
    supabase.from('cycle_tasks').select('*').eq('cycle_id', cycleId),
    supabase.from('companies').select('name').eq('id', companyId).single(),
  ]);

  if (!cycle || !company) return;

  const cycleData: OperatingCycle = {
    id: cycle.id,
    companyId: cycle.company_id,
    status: cycle.status,
    trigger: cycle.trigger,
    plan: cycle.plan as OperatingCycle['plan'],
    userDirective: cycle.user_directive,
    totalTokensUsed: cycle.total_tokens_used || 0,
    totalCostUsd: cycle.total_cost_usd || 0,
    startedAt: cycle.started_at,
    completedAt: cycle.completed_at,
    error: cycle.error,
  };

  const taskData: CycleTask[] = (tasks || []).map((t: Record<string, unknown>) => ({
    id: t.id as string,
    cycleId: t.cycle_id as string,
    agentRole: t.agent_role as CycleTask['agentRole'],
    agentName: t.agent_name as string,
    description: t.description as string,
    status: t.status as CycleTask['status'],
    result: t.result as string | null,
    dependsOn: (t.depends_on as string[]) || [],
    tokensUsed: (t.tokens_used as number) || 0,
    costUsd: (t.cost_usd as number) || 0,
    startedAt: t.started_at as string | null,
    completedAt: t.completed_at as string | null,
    error: t.error as string | null,
  }));

  const digestData: DigestData = { cycle: cycleData, tasks: taskData, companyName: company.name };

  // Send email via Resend
  if (prefs.email_enabled && prefs.email_address && process.env.RESEND_API_KEY) {
    try {
      const html = await generateDigestHtml(digestData);
      const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL || 'Archon <noreply@archon.app>',
          to: prefs.email_address,
          subject: `[Archon] Daily Update — ${company.name} — ${date}`,
          html,
        }),
      });
    } catch (err) {
      console.error('Failed to send email digest:', err);
    }
  }

  // Send WhatsApp via Twilio
  if (prefs.whatsapp_enabled && prefs.whatsapp_number && process.env.TWILIO_ACCOUNT_SID) {
    try {
      const text = generateDigestText(digestData);
      const twilioAuth = Buffer.from(
        `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
      ).toString('base64');

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
      console.error('Failed to send WhatsApp digest:', err);
    }
  }
}

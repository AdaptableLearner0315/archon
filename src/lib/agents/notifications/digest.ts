import type { SupabaseClient } from '@supabase/supabase-js';
import type { CycleTask, OperatingCycle, DigestFrequency, Artifact, ReflectionOutput } from '../../types';
import { AGENT_NAMES } from '../engine';
import { getLatestReflection } from '../reflection';

interface DigestData {
  cycle: OperatingCycle;
  tasks: CycleTask[];
  companyName: string;
  artifacts: Artifact[];
  reflection?: ReflectionOutput | null;
}

const FREQUENCY_MS: Record<DigestFrequency, number> = {
  hourly: 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://archon.app';

function getCriticalityColor(criticality: string): string {
  switch (criticality) {
    case 'critical': return '#ef4444';
    case 'high': return '#f97316';
    case 'medium': return '#eab308';
    case 'low': return '#22c55e';
    default: return '#6b7280';
  }
}

function getCriticalityEmoji(criticality: string): string {
  switch (criticality) {
    case 'critical': return ':red_circle:';
    case 'high': return ':large_orange_circle:';
    case 'medium': return ':large_yellow_circle:';
    case 'low': return ':large_green_circle:';
    default: return ':white_circle:';
  }
}

function formatReflectionHtml(reflection: ReflectionOutput): string {
  const healthColor = reflection.overallHealthScore >= 75 ? '#22c55e' :
    reflection.overallHealthScore >= 50 ? '#eab308' : '#ef4444';

  const kpiRows = reflection.summary.kpiChanges.map((k) => `
    <tr>
      <td style="padding: 4px 8px; color: #9ca3af;">${k.metric}</td>
      <td style="padding: 4px 8px; color: #d1d5db;">${k.from} → ${k.to}</td>
      <td style="padding: 4px 8px; color: ${k.isPositive ? '#22c55e' : '#ef4444'};">${k.change}</td>
    </tr>
  `).join('');

  const recommendationRows = reflection.recommendations.slice(0, 3).map((r) => `
    <div style="background: #0f0f1a; border-radius: 6px; padding: 12px; margin-bottom: 8px; border-left: 3px solid ${getCriticalityColor(r.criticality)};">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
        <span style="color: ${getCriticalityColor(r.criticality)}; font-weight: 600; font-size: 11px; text-transform: uppercase;">${r.criticality}</span>
        <span style="color: #e5e7eb; font-size: 14px;">${r.title}</span>
      </div>
      <p style="color: #9ca3af; font-size: 12px; margin: 4px 0;">${r.reasoning}</p>
      ${r.triggerEnabled ? `
        <a href="${APP_URL}/api/agents/reflection/trigger?action=execute&reflectionId=${reflection.id}&recommendationId=${r.id}"
           style="display: inline-block; background: #8b5cf6; color: white; padding: 6px 12px; border-radius: 4px; text-decoration: none; font-size: 12px; margin-top: 8px;">
          Run: ${r.suggestedAction.description.slice(0, 40)}...
        </a>
      ` : ''}
    </div>
  `).join('');

  return `
    <div style="background: #1a1a2e; border-radius: 8px; padding: 16px; margin-bottom: 20px; border: 1px solid #2d2d3d;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2 style="color: #a78bfa; margin: 0; font-size: 16px;">Weekly Reflection</h2>
        <div style="background: ${healthColor}20; padding: 4px 12px; border-radius: 12px;">
          <span style="color: ${healthColor}; font-size: 14px; font-weight: 600;">Health: ${reflection.overallHealthScore}/100</span>
        </div>
      </div>

      <div style="margin-bottom: 16px;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0 0 8px 0;">KPI Movement</p>
        <table style="width: 100%; border-collapse: collapse;">
          ${kpiRows}
        </table>
      </div>

      <div style="margin-bottom: 12px;">
        <p style="color: #22c55e; font-size: 13px; margin: 0;"><strong>Top Win:</strong> ${reflection.summary.topWin}</p>
      </div>
      <div style="margin-bottom: 16px;">
        <p style="color: #f97316; font-size: 13px; margin: 0;"><strong>Top Concern:</strong> ${reflection.summary.topConcern}</p>
      </div>

      <p style="color: #9ca3af; font-size: 12px; margin: 0 0 12px 0;">Top Recommendations</p>
      ${recommendationRows}
    </div>
  `;
}

function shouldSendDigest(lastSentAt: string | null, frequency: DigestFrequency): boolean {
  if (!lastSentAt) return true;
  const elapsed = Date.now() - new Date(lastSentAt).getTime();
  return elapsed >= FREQUENCY_MS[frequency];
}

export async function generateDigestHtml(data: DigestData): Promise<string> {
  const { cycle, tasks, companyName, artifacts, reflection } = data;
  const date = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const reflectionSection = reflection ? formatReflectionHtml(reflection) : '';

  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const failedTasks = tasks.filter((t) => t.status === 'failed' || t.status === 'blocked');
  const blockedTasks = tasks.filter((t) => t.needsHumanInput && !t.humanInputResponse);

  const agentHighlights = completedTasks.map((t) => {
    const name = AGENT_NAMES[t.agentRole] || t.agentRole;
    const summary = t.result?.slice(0, 150) || 'Task completed';
    return `<tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #2d2d3d; color: #a78bfa; font-weight: 600;">${name}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #2d2d3d; color: #d1d5db;">${summary}...</td>
    </tr>`;
  }).join('');

  const artifactSection = artifacts.length > 0 ? `
      <div style="background: #0f0f1a; border-radius: 8px; padding: 16px; margin-bottom: 20px; border: 1px solid #2d2d3d;">
        <h2 style="color: #e5e7eb; margin: 0 0 12px 0; font-size: 16px;">Artifacts Produced (${artifacts.length})</h2>
        ${artifacts.map((a) => `
          <div style="padding: 8px 0; border-bottom: 1px solid #2d2d3d;">
            <span style="color: #a78bfa; font-weight: 600; font-size: 13px;">${a.agentName}</span>
            <span style="color: #6b7280; font-size: 12px; margin-left: 8px;">${a.type}</span>
            <p style="color: #d1d5db; margin: 4px 0 0 0; font-size: 13px;">${a.title}</p>
            <p style="color: #9ca3af; margin: 2px 0 0 0; font-size: 12px;">${a.preview.slice(0, 120)}${a.preview.length > 120 ? '...' : ''}</p>
          </div>
        `).join('')}
      </div>
  ` : '';

  const blockedSection = blockedTasks.length > 0 ? `
      <div style="background: #1a1a0f; border-radius: 8px; padding: 16px; margin-bottom: 20px; border: 1px solid #3d3d2d;">
        <h2 style="color: #fbbf24; margin: 0 0 8px 0; font-size: 16px;">Needs Your Input (${blockedTasks.length})</h2>
        ${blockedTasks.map((t) => `<p style="color: #d1d5db; margin: 4px 0; font-size: 13px;">${AGENT_NAMES[t.agentRole]}: ${t.humanInputQuestion || 'Waiting for input'}</p>`).join('')}
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://archon.app'}/dashboard?action=respond"
           style="display: inline-block; background: #d97706; color: white; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 600; margin-top: 8px;">
          Respond Now
        </a>
      </div>
  ` : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16162a 100%); border-radius: 12px; padding: 32px; border: 1px solid #2d2d3d;">
      <h1 style="color: #a78bfa; margin: 0 0 8px 0; font-size: 24px;">Archon Cycle Update</h1>
      <p style="color: #9ca3af; margin: 0 0 24px 0; font-size: 14px;">${companyName} — ${date}</p>

      <div style="background: #0f0f1a; border-radius: 8px; padding: 16px; margin-bottom: 20px; border: 1px solid #2d2d3d;">
        <h2 style="color: #e5e7eb; margin: 0 0 8px 0; font-size: 16px;">Cycle Summary</h2>
        <p style="color: #d1d5db; margin: 0; font-size: 14px;">${cycle.plan?.directive || 'Automated cycle'}</p>
        <div style="margin-top: 12px;">
          <span style="color: #34d399; font-size: 14px;">${completedTasks.length} completed</span>
          ${failedTasks.length > 0 ? `<span style="color: #f87171; font-size: 14px; margin-left: 16px;">${failedTasks.length} failed</span>` : ''}
          ${blockedTasks.length > 0 ? `<span style="color: #fbbf24; font-size: 14px; margin-left: 16px;">${blockedTasks.length} blocked</span>` : ''}
          <span style="color: #9ca3af; font-size: 14px; margin-left: 16px;">$${cycle.totalCostUsd.toFixed(4)}</span>
        </div>
      </div>

      ${completedTasks.length > 0 ? `
      <h2 style="color: #e5e7eb; margin: 0 0 12px 0; font-size: 16px;">Agent Highlights</h2>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        ${agentHighlights}
      </table>
      ` : ''}

      ${reflectionSection}
      ${artifactSection}
      ${blockedSection}

      ${failedTasks.length > 0 ? `
      <div style="background: #1a0f0f; border-radius: 8px; padding: 16px; margin-bottom: 20px; border: 1px solid #3d2d2d;">
        <h2 style="color: #f87171; margin: 0 0 8px 0; font-size: 16px;">Issues</h2>
        ${failedTasks.map((t) => `<p style="color: #d1d5db; margin: 4px 0; font-size: 13px;">${AGENT_NAMES[t.agentRole]}: ${t.error || 'Failed'}</p>`).join('')}
      </div>
      ` : ''}

      <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://archon.app'}/dashboard"
         style="display: inline-block; background: #8b5cf6; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600;">
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
  const { cycle, tasks, companyName, artifacts, reflection } = data;
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const failedTasks = tasks.filter((t) => t.status === 'failed' || t.status === 'blocked');
  const blockedTasks = tasks.filter((t) => t.needsHumanInput && !t.humanInputResponse);

  const lines = [
    `Archon Cycle Update — ${companyName}`,
    '',
    `Cycle: ${cycle.plan?.directive || 'Automated cycle'}`,
    `${completedTasks.length} completed | ${failedTasks.length} failed | $${cycle.totalCostUsd.toFixed(4)}`,
    '',
  ];

  for (const t of completedTasks) {
    lines.push(`- ${AGENT_NAMES[t.agentRole]}: ${t.result?.slice(0, 100) || 'Done'}`);
  }

  // Add reflection section
  if (reflection) {
    lines.push('', '--- Weekly Reflection ---');
    lines.push(`Health Score: ${reflection.overallHealthScore}/100`);
    lines.push('');
    lines.push('KPI Movement:');
    for (const k of reflection.summary.kpiChanges) {
      lines.push(`- ${k.metric}: ${k.from} -> ${k.to} (${k.change})`);
    }
    lines.push('');
    lines.push(`Top Win: ${reflection.summary.topWin}`);
    lines.push(`Top Concern: ${reflection.summary.topConcern}`);
    lines.push('');
    lines.push('Top Recommendations:');
    for (const r of reflection.recommendations.slice(0, 3)) {
      lines.push(`[${r.criticality.toUpperCase()}] ${r.title}`);
      lines.push(`  ${r.reasoning}`);
      if (r.triggerEnabled) {
        lines.push(`  -> ${APP_URL}/api/agents/reflection/trigger?reflectionId=${reflection.id}&recommendationId=${r.id}`);
      }
    }
  }

  if (artifacts.length > 0) {
    lines.push('', `Artifacts produced: ${artifacts.length}`);
    for (const a of artifacts) {
      lines.push(`- ${a.agentName} (${a.type}): ${a.title}`);
    }
  }

  if (blockedTasks.length > 0) {
    lines.push('', 'Needs your input:');
    for (const t of blockedTasks) {
      lines.push(`- ${AGENT_NAMES[t.agentRole]}: ${t.humanInputQuestion || 'Waiting for input'}`);
    }
  }

  if (failedTasks.length > 0) {
    lines.push('', 'Issues:');
    for (const t of failedTasks) {
      lines.push(`- ${AGENT_NAMES[t.agentRole]}: ${t.error || 'Failed'}`);
    }
  }

  lines.push('', `Dashboard: ${APP_URL}/dashboard`);

  return lines.join('\n');
}

function buildSlackBlocks(data: DigestData): Record<string, unknown>[] {
  const { cycle, tasks, artifacts, reflection } = data;
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const failedTasks = tasks.filter((t) => t.status === 'failed' || t.status === 'blocked');
  const blockedTasks = tasks.filter((t) => t.needsHumanInput && !t.humanInputResponse);

  const blocks: Record<string, unknown>[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Archon Cycle Update — ${data.companyName}` },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${cycle.plan?.directive || 'Automated cycle'}*\n${completedTasks.length} completed | ${failedTasks.length} failed | $${cycle.totalCostUsd.toFixed(4)}`,
      },
    },
  ];

  if (completedTasks.length > 0) {
    const highlights = completedTasks.slice(0, 5).map(
      (t) => `• *${AGENT_NAMES[t.agentRole]}*: ${t.result?.slice(0, 80) || 'Done'}`
    ).join('\n');
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Agent Highlights*\n${highlights}` },
    });
  }

  // Add reflection section with trigger buttons
  if (reflection) {
    blocks.push({ type: 'divider' });

    const healthEmoji = reflection.overallHealthScore >= 75 ? ':large_green_circle:' :
      reflection.overallHealthScore >= 50 ? ':large_yellow_circle:' : ':red_circle:';

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Weekly Reflection* ${healthEmoji} Health: ${reflection.overallHealthScore}/100`,
      },
    });

    // KPI changes
    const kpiLines = reflection.summary.kpiChanges.slice(0, 4).map(
      (k) => `• ${k.metric}: ${k.from} → ${k.to} (${k.change})`
    ).join('\n');
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*KPI Movement*\n${kpiLines}` },
    });

    // Top insights
    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Top Win*\n${reflection.summary.topWin}` },
        { type: 'mrkdwn', text: `*Top Concern*\n${reflection.summary.topConcern}` },
      ],
    });

    // Recommendations with trigger buttons
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*Top Recommendations*' },
    });

    for (const r of reflection.recommendations.slice(0, 3)) {
      const emoji = getCriticalityEmoji(r.criticality);
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${emoji} *${r.criticality.toUpperCase()}*: ${r.title}\n${r.reasoning}`,
        },
        accessory: r.triggerEnabled ? {
          type: 'button',
          text: { type: 'plain_text', text: 'Run' },
          action_id: `trigger_recommendation_${r.id}`,
          value: JSON.stringify({ reflectionId: reflection.id, recommendationId: r.id }),
          style: r.criticality === 'critical' ? 'danger' : 'primary',
        } : undefined,
      });
    }

    blocks.push({ type: 'divider' });
  }

  if (artifacts.length > 0) {
    const artifactLines = artifacts.slice(0, 5).map(
      (a) => `• *${a.agentName}* (${a.type}): ${a.title}`
    ).join('\n');
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Artifacts Produced (${artifacts.length})*\n${artifactLines}` },
    });
  }

  if (blockedTasks.length > 0) {
    const blockedLines = blockedTasks.map(
      (t) => `• *${AGENT_NAMES[t.agentRole]}*: ${t.humanInputQuestion || 'Waiting for input'}`
    ).join('\n');
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `:warning: *Needs Your Input (${blockedTasks.length})*\n${blockedLines}` },
    });
  }

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'View Dashboard' },
        url: `${APP_URL}/dashboard`,
        style: 'primary',
      },
    ],
  });

  return blocks;
}

export async function sendDigest(
  cycleId: string,
  companyId: string,
  supabase: SupabaseClient
): Promise<void> {
  // 1. Check preferences and frequency gate
  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('company_id', companyId)
    .single();

  if (!prefs) return;

  const frequency: DigestFrequency = prefs.digest_frequency || 'hourly';
  if (!shouldSendDigest(prefs.last_digest_sent_at, frequency)) {
    return; // Not time yet
  }

  // 2. Fetch cycle data and latest reflection
  const [{ data: cycle }, { data: tasks }, { data: company }, { data: artifacts }, reflection] = await Promise.all([
    supabase.from('operating_cycles').select('*').eq('id', cycleId).single(),
    supabase.from('cycle_tasks').select('*').eq('cycle_id', cycleId),
    supabase.from('companies').select('name').eq('id', companyId).single(),
    supabase.from('artifacts').select('*').eq('cycle_id', cycleId).order('created_at', { ascending: false }),
    getLatestReflection(companyId, supabase, 'weekly'),
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
    needsHumanInput: (t.needs_human_input as boolean) || false,
    humanInputQuestion: t.human_input_question as string | null,
    humanInputResponse: t.human_input_response as string | null,
    humanInputRespondedAt: t.human_input_responded_at as string | null,
    startedAt: t.started_at as string | null,
    completedAt: t.completed_at as string | null,
    error: t.error as string | null,
  }));

  const artifactData: Artifact[] = (artifacts || []).map((a: Record<string, unknown>) => ({
    id: a.id as string,
    companyId: a.company_id as string,
    cycleId: a.cycle_id as string | null,
    taskId: a.task_id as string | null,
    agentRole: a.agent_role as Artifact['agentRole'],
    agentName: a.agent_name as string,
    title: a.title as string,
    type: a.type as Artifact['type'],
    content: a.content as string,
    preview: a.preview as string,
    createdAt: a.created_at as string,
  }));

  const digestData: DigestData = { cycle: cycleData, tasks: taskData, companyName: company.name, artifacts: artifactData, reflection };

  // 3. Send email via Resend
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
          subject: `[Archon] Cycle Update — ${company.name} — ${date}`,
          html,
        }),
      });
    } catch (err) {
      console.error('Failed to send email digest:', err);
    }
  }

  // 4. Send WhatsApp via Twilio
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

  // 5. Send Slack via webhook
  if (prefs.slack_enabled && prefs.slack_webhook_url) {
    try {
      await fetch(prefs.slack_webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `Archon Cycle Update — ${company.name}`,
          blocks: buildSlackBlocks(digestData),
        }),
      });
    } catch (err) {
      console.error('Failed to send Slack digest:', err);
    }
  }

  // 6. Insert webapp notification
  if (prefs.webapp_enabled !== false) {
    try {
      const completedCount = taskData.filter((t) => t.status === 'completed').length;
      await supabase.from('notifications').insert({
        company_id: companyId,
        type: 'digest',
        title: `Cycle Complete — ${completedCount}/${taskData.length} tasks done`,
        body: cycleData.plan?.directive || 'Automated cycle completed',
        action_url: '/dashboard',
      });
    } catch (err) {
      console.error('Failed to insert webapp notification:', err);
    }
  }

  // 7. Update last_digest_sent_at
  await supabase
    .from('notification_preferences')
    .update({ last_digest_sent_at: new Date().toISOString() })
    .eq('company_id', companyId);
}

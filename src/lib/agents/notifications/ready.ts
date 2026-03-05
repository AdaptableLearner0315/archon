/**
 * Ready Email — Sent after the first operating cycle completes
 *
 * Shows what's been done and what's queued for cycle 1
 * Pattern: Resend HTTP API, dark theme HTML (matching project style)
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://archon.app';

export interface CompletedWorkItem {
  description: string;
  link?: string;
}

export interface QueuedTask {
  title: string;
  description: string;
}

export interface ReadyEmailParams {
  toEmail: string;
  userName: string | null;
  companyName: string;
  completedWork: CompletedWorkItem[];
  queuedTasks: QueuedTask[];
  dashboardUrl: string;
}

export async function sendReadyEmail(params: ReadyEmailParams): Promise<void> {
  const {
    toEmail,
    userName,
    companyName,
    completedWork,
    queuedTasks,
    dashboardUrl,
  } = params;

  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set, skipping ready email');
    return;
  }

  const displayName = userName || 'Founder';

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'Archon <noreply@archon.app>',
        to: toEmail,
        subject: `${companyName} is ready`,
        html: buildReadyEmail({
          displayName,
          companyName,
          completedWork,
          queuedTasks,
          dashboardUrl,
        }),
      }),
    });
  } catch (err) {
    console.error('Failed to send ready email:', err);
    throw err;
  }
}

interface EmailBuildParams {
  displayName: string;
  companyName: string;
  completedWork: CompletedWorkItem[];
  queuedTasks: QueuedTask[];
  dashboardUrl: string;
}

function buildReadyEmail(params: EmailBuildParams): string {
  const {
    displayName,
    companyName,
    completedWork,
    queuedTasks,
    dashboardUrl,
  } = params;

  // Build completed work list
  const completedHtml = completedWork.length > 0 ? `
    <div style="margin: 24px 0;">
      <h3 style="color: #a78bfa; margin: 0 0 12px 0; font-size: 14px; font-weight: 600;">What's done</h3>
      <ul style="margin: 0; padding-left: 0; list-style: none;">
        ${completedWork.map(item => `
          <li style="margin-bottom: 10px; padding-left: 20px; position: relative; color: #d1d5db; font-size: 14px; line-height: 1.5;">
            <span style="position: absolute; left: 0; color: #22c55e;">✓</span>
            ${item.link
              ? `${item.description} <a href="${item.link}" style="color: #a78bfa; text-decoration: none;">→</a>`
              : item.description}
          </li>
        `).join('')}
      </ul>
    </div>
  ` : '';

  // Build queued tasks list
  const queuedHtml = queuedTasks.length > 0 ? `
    <div style="background: rgba(139, 92, 246, 0.1); border-radius: 8px; padding: 16px; margin: 24px 0; border: 1px solid rgba(139, 92, 246, 0.3);">
      <h3 style="color: #a78bfa; margin: 0 0 12px 0; font-size: 14px; font-weight: 600;">Tasks queued for Cycle 1</h3>
      <ol style="margin: 0; padding-left: 20px; color: #d1d5db; font-size: 14px;">
        ${queuedTasks.map(task => `
          <li style="margin-bottom: 12px; line-height: 1.5;">
            <strong style="color: #fff;">${task.title}</strong>
            <p style="margin: 4px 0 0 0; color: #9ca3af; font-size: 13px;">${task.description}</p>
          </li>
        `).join('')}
      </ol>
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16162a 100%); border-radius: 12px; padding: 32px; border: 1px solid #2d2d3d;">

      <h1 style="color: #a78bfa; margin: 0 0 8px 0; font-size: 24px;">${companyName} is ready</h1>
      <p style="color: #9ca3af; margin: 0 0 24px 0; font-size: 14px;">Your AI team has completed the initial setup</p>

      <p style="color: #d1d5db; font-size: 15px; line-height: 1.6; margin-bottom: 16px;">
        Hi ${displayName},
      </p>

      <p style="color: #d1d5db; font-size: 15px; line-height: 1.6; margin-bottom: 8px;">
        Here's what I built for you today:
      </p>

      ${completedHtml}

      ${queuedHtml}

      <p style="color: #d1d5db; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
        Subscribe to start your first operating cycle. Your AI team is ready to execute.
      </p>

      <a href="${dashboardUrl}"
         style="display: inline-block; background: #8b5cf6; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">
        Open your dashboard →
      </a>

      <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #2d2d3d;">
        <p style="color: #9ca3af; font-size: 13px; margin: 0; font-style: italic;">
          — Atlas (Executing the Plan)
        </p>
      </div>
    </div>

    <p style="color: #6b7280; font-size: 12px; text-align: center; margin-top: 16px;">
      Sent by Archon AI • <a href="${APP_URL}/settings/notifications" style="color: #6b7280;">Manage preferences</a>
    </p>
  </div>
</body>
</html>`;
}

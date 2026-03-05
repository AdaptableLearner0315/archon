/**
 * Welcome Email — Sent immediately after onboarding completes
 *
 * Pattern: Resend HTTP API, dark theme HTML (matching project style)
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://archon.app';

export interface WelcomeEmailParams {
  toEmail: string;
  userName: string | null;
  companyName: string;
  businessIdea: string;
  competitors: { name: string }[];
  gap: string | null;
  marketSize: string | null;
  dashboardUrl: string;
}

export async function sendWelcomeEmail(params: WelcomeEmailParams): Promise<void> {
  const {
    toEmail,
    userName,
    companyName,
    businessIdea,
    competitors,
    gap,
    marketSize,
    dashboardUrl,
  } = params;

  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set, skipping welcome email');
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
        subject: `Welcome to ${companyName}!`,
        html: buildWelcomeEmail({
          displayName,
          companyName,
          businessIdea,
          competitors,
          gap,
          marketSize,
          dashboardUrl,
        }),
      }),
    });
  } catch (err) {
    console.error('Failed to send welcome email:', err);
    throw err;
  }
}

interface EmailBuildParams {
  displayName: string;
  companyName: string;
  businessIdea: string;
  competitors: { name: string }[];
  gap: string | null;
  marketSize: string | null;
  dashboardUrl: string;
}

function buildWelcomeEmail(params: EmailBuildParams): string {
  const {
    displayName,
    companyName,
    businessIdea,
    competitors,
    gap,
    marketSize,
    dashboardUrl,
  } = params;

  // Build market insights section if we have data
  let insightsHtml = '';
  if (marketSize || competitors.length > 0 || gap) {
    const insightItems: string[] = [];

    if (marketSize) {
      insightItems.push(`<li style="margin-bottom: 8px;">Market opportunity: <strong style="color: #a78bfa;">${marketSize}</strong></li>`);
    }

    if (competitors.length > 0) {
      const competitorNames = competitors.slice(0, 3).map(c => c.name).join(', ');
      insightItems.push(`<li style="margin-bottom: 8px;">Key competitors: <strong style="color: #a78bfa;">${competitorNames}</strong></li>`);
    }

    if (gap) {
      insightItems.push(`<li style="margin-bottom: 8px;">Your advantage: <strong style="color: #a78bfa;">${gap}</strong></li>`);
    }

    insightsHtml = `
      <div style="background: rgba(139, 92, 246, 0.1); border-radius: 8px; padding: 16px; margin: 20px 0; border: 1px solid rgba(139, 92, 246, 0.3);">
        <h3 style="color: #a78bfa; margin: 0 0 12px 0; font-size: 14px; font-weight: 600;">Market Insights</h3>
        <ul style="margin: 0; padding-left: 20px; color: #d1d5db; font-size: 14px; line-height: 1.6;">
          ${insightItems.join('')}
        </ul>
      </div>
    `;
  }

  // Confetti colors matching the purple theme
  const confettiColors = ['#a78bfa', '#c4b5fd', '#8b5cf6', '#f472b6', '#fbbf24', '#34d399', '#60a5fa'];

  // Generate confetti dots - static positioned elements for email
  const confettiDots = Array.from({ length: 30 }, (_, i) => {
    const color = confettiColors[i % confettiColors.length];
    const size = 4 + (i % 3) * 4; // 4px, 8px, or 12px
    const left = 5 + (i * 31) % 90; // Spread across width
    const top = 10 + (i * 17) % 80; // Spread across height
    const rotation = (i * 45) % 360;
    const shape = i % 3 === 0 ? 'border-radius: 50%;' : i % 3 === 1 ? 'border-radius: 2px;' : 'border-radius: 50% 0 50% 0;';
    return `<div style="position: absolute; left: ${left}%; top: ${top}px; width: ${size}px; height: ${size}px; background: ${color}; ${shape} transform: rotate(${rotation}deg); opacity: 0.6;"></div>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <!-- Celebration header with confetti -->
    <div style="position: relative; height: 100px; overflow: hidden; border-radius: 12px 12px 0 0; background: linear-gradient(135deg, #1a1a2e 0%, #2d1f4e 50%, #1a1a2e 100%);">
      ${confettiDots}
      <div style="position: absolute; bottom: 0; left: 0; right: 0; height: 40px; background: linear-gradient(to top, #1a1a2e, transparent);"></div>
    </div>

    <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16162a 100%); border-radius: 0 0 12px 12px; padding: 32px; border: 1px solid #2d2d3d; border-top: none; margin-top: -1px;">

      <!-- Celebration emoji and title -->
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="font-size: 48px; margin-bottom: 12px;">🎉</div>
        <h1 style="color: #a78bfa; margin: 0 0 8px 0; font-size: 28px; font-weight: 700;">Welcome to ${companyName}!</h1>
        <p style="color: #9ca3af; margin: 0; font-size: 14px;">Your AI organization is online</p>
      </div>

      <p style="color: #d1d5db; font-size: 15px; line-height: 1.6; margin-bottom: 16px;">
        Hi ${displayName},
      </p>

      <p style="color: #d1d5db; font-size: 15px; line-height: 1.6; margin-bottom: 16px;">
        This is your first email from your new company. I'm Atlas, your AI CEO, and I've just finished setting up your organization.
      </p>

      <p style="color: #d1d5db; font-size: 15px; line-height: 1.6; margin-bottom: 20px;">
        You told me about <strong style="color: #fff;">${businessIdea}</strong> — and I've already started working on it.
      </p>

      ${insightsHtml}

      <p style="color: #d1d5db; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
        Check your dashboard to watch me work. Your AI team is analyzing your market, researching competitors, and building your strategy right now.
      </p>

      <a href="${dashboardUrl}"
         style="display: inline-block; background: #8b5cf6; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">
        View Dashboard →
      </a>

      <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #2d2d3d;">
        <p style="color: #9ca3af; font-size: 13px; margin: 0; font-style: italic;">
          — Atlas, CEO of ${companyName}
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

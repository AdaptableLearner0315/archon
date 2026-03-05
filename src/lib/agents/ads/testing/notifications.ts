/**
 * Ad Winner Notifications
 * Sends multi-channel notifications when a winning ad is detected
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdTestWinner, AdCreative, AdTestCampaign } from './types';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://archon.app';

interface NotificationPreferences {
  email_enabled: boolean;
  email_address: string | null;
  whatsapp_enabled: boolean;
  whatsapp_number: string | null;
  slack_enabled: boolean;
  slack_webhook_url: string | null;
  webapp_enabled: boolean;
}

/**
 * Generate HTML email content for winner notification
 */
function generateWinnerEmailHtml(
  winner: AdTestWinner,
  creative: AdCreative,
  campaign: AdTestCampaign,
  companyName: string
): string {
  const metrics = winner.winningMetrics;
  const scaledText = winner.budgetAfterScaling > winner.budgetBeforeScaling
    ? `Budget scaled from $${(winner.budgetBeforeScaling / 100).toFixed(2)} to $${(winner.budgetAfterScaling / 100).toFixed(2)}/day`
    : 'Budget unchanged';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16162a 100%); border-radius: 12px; padding: 32px; border: 1px solid #2d2d3d;">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="font-size: 48px;">🏆</span>
      </div>

      <h1 style="color: #22c55e; margin: 0 0 8px 0; font-size: 24px; text-align: center;">Winning Ad Found!</h1>
      <p style="color: #9ca3af; margin: 0 0 24px 0; font-size: 14px; text-align: center;">${companyName} — ${campaign.name}</p>

      <div style="background: #0f0f1a; border-radius: 8px; padding: 16px; margin-bottom: 20px; border: 1px solid #22c55e;">
        <h2 style="color: #e5e7eb; margin: 0 0 12px 0; font-size: 16px;">Performance Metrics</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #9ca3af;">CTR</td>
            <td style="padding: 8px 0; color: #22c55e; font-weight: 600; text-align: right;">${metrics.ctr.toFixed(2)}%</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #9ca3af;">CPA</td>
            <td style="padding: 8px 0; color: #e5e7eb; text-align: right;">$${metrics.cpa.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #9ca3af;">ROAS</td>
            <td style="padding: 8px 0; color: ${metrics.roas >= 2 ? '#22c55e' : '#e5e7eb'}; text-align: right;">${metrics.roas.toFixed(2)}x</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #9ca3af;">Impressions</td>
            <td style="padding: 8px 0; color: #e5e7eb; text-align: right;">${metrics.impressions.toLocaleString()}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #9ca3af;">Conversions</td>
            <td style="padding: 8px 0; color: #e5e7eb; text-align: right;">${metrics.conversions}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #9ca3af;">Revenue</td>
            <td style="padding: 8px 0; color: #22c55e; font-weight: 600; text-align: right;">$${metrics.revenue.toFixed(2)}</td>
          </tr>
        </table>
      </div>

      <div style="background: #0f0f1a; border-radius: 8px; padding: 16px; margin-bottom: 20px; border: 1px solid #2d2d3d;">
        <h2 style="color: #e5e7eb; margin: 0 0 12px 0; font-size: 16px;">Winning Creative</h2>
        <p style="color: #a78bfa; margin: 0 0 8px 0; font-size: 14px;"><strong>Hook:</strong></p>
        <p style="color: #d1d5db; margin: 0 0 12px 0; font-size: 13px; font-style: italic;">"${creative.content.hook}"</p>
        <p style="color: #a78bfa; margin: 0 0 8px 0; font-size: 14px;"><strong>CTA:</strong></p>
        <p style="color: #d1d5db; margin: 0; font-size: 13px;">${creative.content.cta}</p>
      </div>

      <div style="background: #0f0f1a; border-radius: 8px; padding: 16px; margin-bottom: 20px; border: 1px solid #2d2d3d;">
        <p style="color: #9ca3af; margin: 0 0 4px 0; font-size: 12px;">Statistical Significance</p>
        <p style="color: #22c55e; margin: 0 0 12px 0; font-size: 14px; font-weight: 600;">p-value: ${winner.statisticalSignificance.toFixed(4)}</p>
        <p style="color: #9ca3af; margin: 0 0 4px 0; font-size: 12px;">Budget Update</p>
        <p style="color: #e5e7eb; margin: 0; font-size: 14px;">${scaledText}</p>
      </div>

      <a href="${APP_URL}/dashboard/ads/campaigns/${campaign.id}"
         style="display: block; background: #8b5cf6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600; text-align: center;">
        View Campaign Details
      </a>
    </div>
    <p style="color: #6b7280; font-size: 12px; text-align: center; margin-top: 16px;">
      Powered by Archon — The 1-Person Unicorn Engine
    </p>
  </div>
</body>
</html>`;
}

/**
 * Generate plain text content for winner notification
 */
function generateWinnerText(
  winner: AdTestWinner,
  creative: AdCreative,
  campaign: AdTestCampaign,
  companyName: string
): string {
  const metrics = winner.winningMetrics;

  return `🏆 WINNING AD FOUND!

${companyName} — ${campaign.name}

Performance Metrics:
• CTR: ${metrics.ctr.toFixed(2)}%
• CPA: $${metrics.cpa.toFixed(2)}
• ROAS: ${metrics.roas.toFixed(2)}x
• Impressions: ${metrics.impressions.toLocaleString()}
• Conversions: ${metrics.conversions}
• Revenue: $${metrics.revenue.toFixed(2)}

Winning Creative:
Hook: "${creative.content.hook}"
CTA: ${creative.content.cta}

Statistical Significance: p=${winner.statisticalSignificance.toFixed(4)}
Budget: $${(winner.budgetBeforeScaling / 100).toFixed(2)} → $${(winner.budgetAfterScaling / 100).toFixed(2)}/day

View details: ${APP_URL}/dashboard/ads/campaigns/${campaign.id}`;
}

/**
 * Build Slack blocks for winner notification
 */
function buildSlackBlocks(
  winner: AdTestWinner,
  creative: AdCreative,
  campaign: AdTestCampaign,
  companyName: string
): Record<string, unknown>[] {
  const metrics = winner.winningMetrics;

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: '🏆 Winning Ad Found!' },
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `*${companyName}* — ${campaign.name}` },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*CTR*\n${metrics.ctr.toFixed(2)}%` },
        { type: 'mrkdwn', text: `*CPA*\n$${metrics.cpa.toFixed(2)}` },
        { type: 'mrkdwn', text: `*ROAS*\n${metrics.roas.toFixed(2)}x` },
        { type: 'mrkdwn', text: `*Revenue*\n$${metrics.revenue.toFixed(2)}` },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Winning Hook:*\n_"${creative.content.hook}"_`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Statistical significance: p=${winner.statisticalSignificance.toFixed(4)} | Budget scaled: $${(winner.budgetBeforeScaling / 100).toFixed(2)} → $${(winner.budgetAfterScaling / 100).toFixed(2)}/day`,
        },
      ],
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View Campaign' },
          url: `${APP_URL}/dashboard/ads/campaigns/${campaign.id}`,
          style: 'primary',
        },
      ],
    },
  ];
}

/**
 * Send winner notification through all enabled channels
 */
export async function notifyWinnerFound(
  winner: AdTestWinner,
  supabase: SupabaseClient
): Promise<{
  channels: string[];
  errors: string[];
}> {
  const channelsNotified: string[] = [];
  const errors: string[] = [];

  // Get campaign and creative details
  const { data: campaignData } = await supabase
    .from('ad_test_campaigns')
    .select('*, companies!inner(id, name)')
    .eq('id', winner.campaignId)
    .single();

  if (!campaignData) {
    throw new Error('Campaign not found');
  }

  const campaign = campaignData as unknown as AdTestCampaign & { companies: { id: string; name: string } };
  const companyId = campaign.companies.id;
  const companyName = campaign.companies.name;

  const { data: creativeData } = await supabase
    .from('ad_creatives')
    .select('*')
    .eq('id', winner.creativeId)
    .single();

  if (!creativeData) {
    throw new Error('Creative not found');
  }

  const creative = creativeData as unknown as AdCreative;

  // Get notification preferences
  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('company_id', companyId)
    .single();

  if (!prefs) {
    // Create in-app notification only
    await supabase.from('notifications').insert({
      company_id: companyId,
      type: 'ad_winner',
      title: `🏆 Winning Ad Found — ${campaign.name}`,
      body: `CTR: ${winner.winningMetrics.ctr.toFixed(2)}% | Revenue: $${winner.winningMetrics.revenue.toFixed(2)}`,
      action_url: `/dashboard/ads/campaigns/${campaign.id}`,
    });
    channelsNotified.push('in-app');

    // Mark as notified
    await updateWinnerNotified(winner.id, channelsNotified, supabase);

    return { channels: channelsNotified, errors };
  }

  const preferences = prefs as NotificationPreferences;

  // Send email via Resend
  if (preferences.email_enabled && preferences.email_address && process.env.RESEND_API_KEY) {
    try {
      const html = generateWinnerEmailHtml(winner, creative, campaign, companyName);
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL || 'Archon <noreply@archon.app>',
          to: preferences.email_address,
          subject: `🏆 Winning Ad Found — ${campaign.name}`,
          html,
        }),
      });
      channelsNotified.push('email');
    } catch (err) {
      errors.push(`Email failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  // Send WhatsApp via Twilio
  if (preferences.whatsapp_enabled && preferences.whatsapp_number && process.env.TWILIO_ACCOUNT_SID) {
    try {
      const text = generateWinnerText(winner, creative, campaign, companyName);
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
            To: `whatsapp:${preferences.whatsapp_number}`,
            Body: text,
          }),
        }
      );
      channelsNotified.push('whatsapp');
    } catch (err) {
      errors.push(`WhatsApp failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  // Send Slack via webhook
  if (preferences.slack_enabled && preferences.slack_webhook_url) {
    try {
      await fetch(preferences.slack_webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `🏆 Winning Ad Found — ${campaign.name}`,
          blocks: buildSlackBlocks(winner, creative, campaign, companyName),
        }),
      });
      channelsNotified.push('slack');
    } catch (err) {
      errors.push(`Slack failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  // Insert webapp notification
  if (preferences.webapp_enabled !== false) {
    try {
      await supabase.from('notifications').insert({
        company_id: companyId,
        type: 'ad_winner',
        title: `🏆 Winning Ad Found — ${campaign.name}`,
        body: `CTR: ${winner.winningMetrics.ctr.toFixed(2)}% | Revenue: $${winner.winningMetrics.revenue.toFixed(2)}`,
        action_url: `/dashboard/ads/campaigns/${campaign.id}`,
      });
      channelsNotified.push('in-app');
    } catch (err) {
      errors.push(`In-app notification failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  // Mark winner as notified
  await updateWinnerNotified(winner.id, channelsNotified, supabase);

  return { channels: channelsNotified, errors };
}

/**
 * Update winner record to mark as notified
 */
async function updateWinnerNotified(
  winnerId: string,
  channels: string[],
  supabase: SupabaseClient
): Promise<void> {
  await supabase
    .from('ad_test_winners')
    .update({
      notified: true,
      notified_at: new Date().toISOString(),
      notification_channels: channels,
    })
    .eq('id', winnerId);
}

/**
 * Get un-notified winners (for retry/manual notification)
 */
export async function getUnnotifiedWinners(
  companyId: string,
  supabase: SupabaseClient
): Promise<AdTestWinner[]> {
  const { data, error } = await supabase
    .from('ad_test_winners')
    .select('*, ad_test_campaigns!inner(company_id)')
    .eq('ad_test_campaigns.company_id', companyId)
    .eq('notified', false);

  if (error) {
    throw new Error(`Failed to fetch un-notified winners: ${error.message}`);
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    campaignId: row.campaign_id as string,
    publicationId: row.publication_id as string,
    creativeId: row.creative_id as string,
    declaredAt: row.declared_at as string,
    winningMetrics: row.winning_metrics as AdTestWinner['winningMetrics'],
    statisticalSignificance: Number(row.statistical_significance),
    comparisonGroupSize: row.comparison_group_size as number,
    budgetBeforeScaling: row.budget_before_scaling as number,
    budgetAfterScaling: row.budget_after_scaling as number,
    notified: row.notified as boolean,
    notifiedAt: row.notified_at as string | null,
    notificationChannels: row.notification_channels as string[],
  }));
}

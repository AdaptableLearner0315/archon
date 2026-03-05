/**
 * Email Templates Generator
 *
 * Uses Echo (Marketing) agent to generate email templates
 * and sequences for the business.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { InfrastructureContext, InfraResult, EmailTemplateContent } from '../types';
import { EMAIL_SEQUENCE_TEMPLATES } from '../templates/business-templates';

const anthropic = new Anthropic();

const EMAIL_TEMPLATE_PROMPT = `You are generating email templates for a {businessType} business.

Business: {productName}
Description: {businessDescription}
Brand Tone: {brandTone}
Target Audience: {targetAudience}

Generate email templates as JSON:

{
  "templates": [
    {
      "name": "welcome",
      "subject": "Welcome to {productName}!",
      "htmlContent": "HTML email content with inline styles",
      "textContent": "Plain text version",
      "purpose": "welcome"
    }
  ]
}

Create these templates:
1. Welcome email (first impression)
2. Transactional confirmation
3. Engagement/re-engagement
4. Feature announcement

Requirements:
- Use {brandTone} tone throughout
- Include clear CTAs
- Mobile-responsive design
- Plain text alternatives
- Personalization tokens like {{name}}, {{productName}}`;

export async function generateEmailTemplates(
  context: InfrastructureContext,
  companyId: string,
  onProgress: (agent: string | null, progress: number) => void
): Promise<InfraResult<EmailTemplateContent>> {
  const startTime = Date.now();
  let tokensUsed = 0;

  try {
    // Get base sequences
    const baseSequences = EMAIL_SEQUENCE_TEMPLATES[context.businessType];

    // Generate templates using Echo (Marketing) agent
    onProgress('marketing', 20);

    const prompt = EMAIL_TEMPLATE_PROMPT
      .replace('{businessType}', context.businessType)
      .replace('{productName}', context.productName)
      .replace('{businessDescription}', context.businessDescription)
      .replace('{brandTone}', context.brandTone)
      .replace('{targetAudience}', context.targetAudience.demographics)
      .replace('{productName}', context.productName);

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    tokensUsed += response.usage.input_tokens + response.usage.output_tokens;
    onProgress('marketing', 60);

    // Parse response
    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
    let generatedTemplates: { templates?: EmailTemplateContent['templates'] } = {};

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        generatedTemplates = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Use defaults
    }

    onProgress('marketing', 80);

    // Build final content
    const domain = context.preferredDomain || 'example.com';

    const finalContent: EmailTemplateContent = {
      templates: generatedTemplates.templates || generateDefaultTemplates(context),
      sequences: baseSequences.map((seq) => ({
        name: seq.name,
        trigger: seq.trigger,
        emails: seq.emails.map((e) => ({
          delay: e.delay,
          templateName: e.subject.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        })),
      })),
      dnsRecords: generateDnsRecords(domain),
      deliverabilityChecklist: generateDeliverabilityChecklist(),
    };

    onProgress(null, 100);

    return {
      success: true,
      type: 'email',
      content: finalContent,
      metadata: {
        generatedAt: new Date().toISOString(),
        agentsUsed: ['marketing'],
        tokensUsed,
        version: 1,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      type: 'email',
      content: generateFallbackContent(context),
      metadata: {
        generatedAt: new Date().toISOString(),
        agentsUsed: ['marketing'],
        tokensUsed,
        version: 1,
      },
      error: errorMessage,
    };
  }
}

function generateDefaultTemplates(context: InfrastructureContext): EmailTemplateContent['templates'] {
  const brandColor = context.brandColors?.primary || '#8b5cf6';

  return [
    {
      name: 'welcome',
      subject: `Welcome to ${context.productName}! 🎉`,
      htmlContent: generateWelcomeHtml(context, brandColor),
      textContent: generateWelcomeText(context),
      purpose: 'welcome',
    },
    {
      name: 'confirmation',
      subject: `Your ${context.productName} account is confirmed`,
      htmlContent: generateConfirmationHtml(context, brandColor),
      textContent: generateConfirmationText(context),
      purpose: 'transactional',
    },
    {
      name: 'engagement',
      subject: `Check out what's new at ${context.productName}`,
      htmlContent: generateEngagementHtml(context, brandColor),
      textContent: generateEngagementText(context),
      purpose: 'marketing',
    },
    {
      name: 'notification',
      subject: `[${context.productName}] {{notification_title}}`,
      htmlContent: generateNotificationHtml(context, brandColor),
      textContent: generateNotificationText(context),
      purpose: 'notification',
    },
  ];
}

function generateWelcomeHtml(context: InfrastructureContext, brandColor: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ${context.productName}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background-color: ${brandColor}; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Welcome to ${context.productName}!</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #374151;">
                Hi {{name}},
              </p>
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #374151;">
                Thank you for joining ${context.productName}! We're excited to have you on board.
              </p>
              <p style="margin: 0 0 30px; font-size: 16px; line-height: 1.6; color: #374151;">
                ${context.uniqueValueProp}
              </p>
              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <a href="{{dashboard_url}}" style="display: inline-block; padding: 14px 32px; background-color: ${brandColor}; color: #ffffff; text-decoration: none; font-weight: 600; border-radius: 6px;">
                      Get Started
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; font-size: 14px; color: #6b7280;">
                Questions? Reply to this email or reach out at support@${context.preferredDomain || 'example.com'}
              </p>
              <p style="margin: 10px 0 0; font-size: 12px; color: #9ca3af;">
                © ${new Date().getFullYear()} ${context.productName}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function generateWelcomeText(context: InfrastructureContext): string {
  return `Welcome to ${context.productName}!

Hi {{name}},

Thank you for joining ${context.productName}! We're excited to have you on board.

${context.uniqueValueProp}

Get started: {{dashboard_url}}

Questions? Reply to this email or reach out at support@${context.preferredDomain || 'example.com'}

© ${new Date().getFullYear()} ${context.productName}. All rights reserved.`;
}

function generateConfirmationHtml(context: InfrastructureContext, brandColor: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px;">
          <tr>
            <td style="padding: 40px; text-align: center;">
              <div style="width: 64px; height: 64px; margin: 0 auto 20px; background-color: #10b981; border-radius: 50%; line-height: 64px; font-size: 32px;">✓</div>
              <h1 style="margin: 0 0 20px; color: #111827; font-size: 24px;">Account Confirmed!</h1>
              <p style="margin: 0 0 30px; font-size: 16px; color: #374151;">
                Your ${context.productName} account is now fully set up and ready to use.
              </p>
              <a href="{{dashboard_url}}" style="display: inline-block; padding: 14px 32px; background-color: ${brandColor}; color: #ffffff; text-decoration: none; font-weight: 600; border-radius: 6px;">
                Go to Dashboard
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function generateConfirmationText(context: InfrastructureContext): string {
  return `Account Confirmed!

Your ${context.productName} account is now fully set up and ready to use.

Go to Dashboard: {{dashboard_url}}`;
}

function generateEngagementHtml(context: InfrastructureContext, brandColor: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px;">
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px; color: #111827; font-size: 24px;">What's New at ${context.productName}</h1>
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #374151;">
                Hi {{name}},
              </p>
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #374151;">
                We've been busy making ${context.productName} even better for you. Here's what's new:
              </p>
              <ul style="margin: 0 0 30px; padding-left: 20px; font-size: 16px; line-height: 1.8; color: #374151;">
                <li>{{feature_1}}</li>
                <li>{{feature_2}}</li>
                <li>{{feature_3}}</li>
              </ul>
              <a href="{{cta_url}}" style="display: inline-block; padding: 14px 32px; background-color: ${brandColor}; color: #ffffff; text-decoration: none; font-weight: 600; border-radius: 6px;">
                {{cta_text}}
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function generateEngagementText(context: InfrastructureContext): string {
  return `What's New at ${context.productName}

Hi {{name}},

We've been busy making ${context.productName} even better for you. Here's what's new:

- {{feature_1}}
- {{feature_2}}
- {{feature_3}}

{{cta_text}}: {{cta_url}}`;
}

function generateNotificationHtml(context: InfrastructureContext, brandColor: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px;">
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px; color: #111827; font-size: 20px;">{{notification_title}}</h2>
              <p style="margin: 0 0 30px; font-size: 16px; line-height: 1.6; color: #374151;">
                {{notification_body}}
              </p>
              <a href="{{action_url}}" style="display: inline-block; padding: 12px 24px; background-color: ${brandColor}; color: #ffffff; text-decoration: none; font-weight: 600; border-radius: 6px; font-size: 14px;">
                {{action_text}}
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function generateNotificationText(context: InfrastructureContext): string {
  return `{{notification_title}}

{{notification_body}}

{{action_text}}: {{action_url}}`;
}

function generateDnsRecords(domain: string): EmailTemplateContent['dnsRecords'] {
  return [
    {
      type: 'TXT',
      name: '@',
      value: 'v=spf1 include:_spf.resend.com ~all',
      purpose: 'SPF record for email authentication',
    },
    {
      type: 'CNAME',
      name: 'resend._domainkey',
      value: 'resend._domainkey.resend.dev',
      purpose: 'DKIM signing for email authentication',
    },
    {
      type: 'TXT',
      name: '_dmarc',
      value: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@' + domain,
      purpose: 'DMARC policy for email protection',
    },
    {
      type: 'MX',
      name: '@',
      value: '10 feedback-smtp.resend.com',
      purpose: 'Mail exchange for bounce handling',
    },
  ];
}

function generateDeliverabilityChecklist(): string[] {
  return [
    'Set up SPF record (TXT record with v=spf1)',
    'Configure DKIM signing (CNAME record)',
    'Implement DMARC policy (TXT record)',
    'Warm up sending domain (start with low volume)',
    'Use consistent From address and name',
    'Include physical address in footer (CAN-SPAM)',
    'Add one-click unsubscribe link',
    'Test emails across major providers (Gmail, Outlook, Yahoo)',
    'Monitor bounce rates and spam complaints',
    'Keep email list clean (remove hard bounces)',
    'Use double opt-in for subscriptions',
    'Personalize subject lines and content',
    'Optimize send times for your audience',
    'A/B test subject lines and CTAs',
    'Monitor inbox placement rates',
  ];
}

function generateFallbackContent(context: InfrastructureContext): EmailTemplateContent {
  return {
    templates: generateDefaultTemplates(context),
    sequences: EMAIL_SEQUENCE_TEMPLATES[context.businessType].map((seq) => ({
      name: seq.name,
      trigger: seq.trigger,
      emails: seq.emails.map((e) => ({
        delay: e.delay,
        templateName: e.subject.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      })),
    })),
    dnsRecords: generateDnsRecords(context.preferredDomain || 'example.com'),
    deliverabilityChecklist: generateDeliverabilityChecklist(),
  };
}

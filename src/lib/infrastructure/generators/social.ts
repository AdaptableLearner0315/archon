/**
 * Social Media Content Generator
 *
 * Uses Echo (Marketing) + Pulse (Growth) agents to generate
 * social media strategy and content.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { InfrastructureContext, InfraResult, SocialContent } from '../types';
import { SOCIAL_TEMPLATES } from '../templates/business-templates';

const anthropic = new Anthropic();

const SOCIAL_CONTENT_PROMPT = `You are a social media strategist creating content for a {businessType} business.

Business: {productName}
Description: {businessDescription}
Target Audience: {targetAudience}
Brand Tone: {brandTone}
Value Proposition: {uniqueValueProp}
Competitors: {competitors}

Generate a complete Twitter/X strategy as JSON:

{
  "twitter": {
    "bio": "Compelling bio (max 160 chars)",
    "pinnedTweet": "High-value pinned tweet that converts followers",
    "headerImagePrompt": "Description for header image design",
    "contentCalendar": [
      {
        "day": 1,
        "content": "Tweet content (max 280 chars)",
        "type": "single|thread|reply|quote",
        "hashtags": ["relevant", "hashtags"],
        "bestTime": "9:00 AM EST"
      }
    ],
    "hashtagStrategy": ["primary", "secondary", "niche"],
    "competitorAccounts": ["@competitor1"],
    "growthTactics": ["Engagement strategy 1", "Growth tactic 2"]
  }
}

Requirements:
- Bio should highlight value prop and include CTA
- Pinned tweet should be evergreen and compelling
- 7-day content calendar with varied content types
- Include threads for thought leadership
- Growth tactics specific to this business type
- Hashtags relevant to target audience`;

export async function generateSocialContent(
  context: InfrastructureContext,
  companyId: string,
  onProgress: (agent: string | null, progress: number) => void
): Promise<InfraResult<SocialContent>> {
  const startTime = Date.now();
  let tokensUsed = 0;

  try {
    const template = SOCIAL_TEMPLATES[context.businessType];

    // Generate using Echo (Marketing) + Pulse (Growth) agents
    onProgress('marketing', 20);

    const prompt = SOCIAL_CONTENT_PROMPT
      .replace('{businessType}', context.businessType)
      .replace('{productName}', context.productName)
      .replace('{businessDescription}', context.businessDescription)
      .replace('{targetAudience}', context.targetAudience.demographics)
      .replace('{brandTone}', context.brandTone)
      .replace('{uniqueValueProp}', context.uniqueValueProp)
      .replace('{competitors}', context.competitors.map((c) => c.name).join(', ') || 'Not specified');

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
    onProgress('growth', 60);

    // Parse response
    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
    let generatedContent: Partial<SocialContent> = {};

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        generatedContent = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Use defaults
    }

    onProgress('growth', 90);

    // Build final content
    const twitterHandle = context.socialHandles?.twitter || context.productName.toLowerCase().replace(/[^a-z0-9]/g, '');

    const finalContent: SocialContent = {
      twitter: {
        bio: generatedContent.twitter?.bio || generateDefaultBio(context, template),
        pinnedTweet: generatedContent.twitter?.pinnedTweet || generateDefaultPinnedTweet(context),
        headerImagePrompt: generatedContent.twitter?.headerImagePrompt || `Modern, ${context.brandTone} header for ${context.productName}. ${context.businessType} business. Purple gradient with subtle patterns.`,
        contentCalendar: generatedContent.twitter?.contentCalendar || generateDefaultCalendar(context),
        hashtagStrategy: generatedContent.twitter?.hashtagStrategy || generateHashtags(context),
        competitorAccounts: generatedContent.twitter?.competitorAccounts || [],
        growthTactics: generatedContent.twitter?.growthTactics || generateGrowthTactics(context),
      },
      linkedin: {
        bio: `${context.productName} - ${context.uniqueValueProp}`,
        headline: `Helping ${context.targetAudience.demographics} ${context.targetAudience.desiredOutcome}`,
        contentIdeas: [
          'Company story and mission',
          'Behind-the-scenes of building the product',
          'Customer success stories',
          'Industry insights and trends',
          'Team spotlights',
        ],
      },
    };

    onProgress(null, 100);

    return {
      success: true,
      type: 'social',
      content: finalContent,
      metadata: {
        generatedAt: new Date().toISOString(),
        agentsUsed: ['marketing', 'growth'],
        tokensUsed,
        version: 1,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      type: 'social',
      content: generateFallbackContent(context),
      metadata: {
        generatedAt: new Date().toISOString(),
        agentsUsed: ['marketing', 'growth'],
        tokensUsed,
        version: 1,
      },
      error: errorMessage,
    };
  }
}

function generateDefaultBio(context: InfrastructureContext, template: typeof SOCIAL_TEMPLATES.saas): string {
  const bio = template.bioStructure
    .replace('{productName}', context.productName)
    .replace('{tagline}', context.tagline.substring(0, 40))
    .replace('{keyBenefit}', context.keyFeatures[0] || 'Better solutions')
    .replace('{name}', context.productName)
    .replace('{niche}', context.businessType)
    .replace('{credibility}', 'Building in public')
    .replace('{cta}', 'Link below 👇')
    .replace('{role}', 'Founder')
    .replace('{specialization}', context.keyFeatures[0] || 'Expert')
    .replace('{result/credibility}', 'Helping businesses grow')
    .replace('{brandName}', context.productName)
    .replace('{uniqueSelling}', context.uniqueValueProp.substring(0, 30));

  return bio.substring(0, 160);
}

function generateDefaultPinnedTweet(context: InfrastructureContext): string {
  const templates = {
    saas: `🚀 Introducing ${context.productName}

${context.uniqueValueProp}

Here's what makes us different:
${context.keyFeatures.slice(0, 3).map((f) => `→ ${f}`).join('\n')}

Try it free 👇`,

    creator: `👋 Hey, I'm building ${context.productName}

${context.businessDescription.substring(0, 100)}

What you'll get:
${context.keyFeatures.slice(0, 3).map((f) => `✨ ${f}`).join('\n')}

Join the journey 👇`,

    services: `I help ${context.targetAudience.demographics} ${context.targetAudience.desiredOutcome}

My approach:
${context.keyFeatures.slice(0, 3).map((f) => `→ ${f}`).join('\n')}

DM "START" to chat about your project 📩`,

    ecommerce: `✨ Welcome to ${context.productName}

${context.uniqueValueProp}

Shop highlights:
${context.keyFeatures.slice(0, 3).map((f) => `🛍️ ${f}`).join('\n')}

New arrivals weekly. Shop now 👇`,
  };

  return templates[context.businessType] || templates.saas;
}

function generateDefaultCalendar(context: InfrastructureContext): SocialContent['twitter']['contentCalendar'] {
  const contentTypes = {
    saas: [
      { day: 1, type: 'thread' as const, topic: 'Problem-solution introduction', time: '9:00 AM EST' },
      { day: 2, type: 'single' as const, topic: 'Feature highlight', time: '12:00 PM EST' },
      { day: 3, type: 'single' as const, topic: 'Quick tip', time: '9:00 AM EST' },
      { day: 4, type: 'thread' as const, topic: 'Behind-the-scenes', time: '3:00 PM EST' },
      { day: 5, type: 'single' as const, topic: 'Customer insight', time: '9:00 AM EST' },
      { day: 6, type: 'single' as const, topic: 'Industry trend', time: '11:00 AM EST' },
      { day: 7, type: 'single' as const, topic: 'Week recap + CTA', time: '10:00 AM EST' },
    ],
    creator: [
      { day: 1, type: 'thread' as const, topic: 'Value-packed thread', time: '8:00 AM EST' },
      { day: 2, type: 'single' as const, topic: 'Personal insight', time: '12:00 PM EST' },
      { day: 3, type: 'single' as const, topic: 'Content teaser', time: '9:00 AM EST' },
      { day: 4, type: 'thread' as const, topic: 'How-to guide', time: '8:00 AM EST' },
      { day: 5, type: 'single' as const, topic: 'Community engagement', time: '3:00 PM EST' },
      { day: 6, type: 'single' as const, topic: 'Behind-the-scenes', time: '11:00 AM EST' },
      { day: 7, type: 'single' as const, topic: 'Week reflection', time: '10:00 AM EST' },
    ],
    services: [
      { day: 1, type: 'thread' as const, topic: 'Case study', time: '9:00 AM EST' },
      { day: 2, type: 'single' as const, topic: 'Expertise tip', time: '11:00 AM EST' },
      { day: 3, type: 'single' as const, topic: 'Client result', time: '9:00 AM EST' },
      { day: 4, type: 'single' as const, topic: 'Industry insight', time: '2:00 PM EST' },
      { day: 5, type: 'thread' as const, topic: 'Process breakdown', time: '9:00 AM EST' },
      { day: 6, type: 'single' as const, topic: 'FAQ answer', time: '10:00 AM EST' },
      { day: 7, type: 'single' as const, topic: 'Availability + CTA', time: '11:00 AM EST' },
    ],
    ecommerce: [
      { day: 1, type: 'single' as const, topic: 'Product spotlight', time: '10:00 AM EST' },
      { day: 2, type: 'single' as const, topic: 'Customer photo', time: '2:00 PM EST' },
      { day: 3, type: 'single' as const, topic: 'Behind-the-scenes', time: '11:00 AM EST' },
      { day: 4, type: 'thread' as const, topic: 'Brand story', time: '9:00 AM EST' },
      { day: 5, type: 'single' as const, topic: 'New arrival tease', time: '12:00 PM EST' },
      { day: 6, type: 'single' as const, topic: 'Lifestyle content', time: '3:00 PM EST' },
      { day: 7, type: 'single' as const, topic: 'Weekend sale/promo', time: '10:00 AM EST' },
    ],
  };

  const schedule = contentTypes[context.businessType];

  return schedule.map((item) => ({
    day: item.day,
    content: generateTweetContent(context, item.topic, item.type),
    type: item.type,
    hashtags: generateHashtags(context).slice(0, 3),
    bestTime: item.time,
  }));
}

function generateTweetContent(
  context: InfrastructureContext,
  topic: string,
  type: 'single' | 'thread' | 'reply' | 'quote'
): string {
  const templates: Record<string, string> = {
    'Problem-solution introduction': `Most ${context.targetAudience.demographics} struggle with ${context.targetAudience.painPoints[0] || 'common challenges'}.

Here's how ${context.productName} solves this 🧵`,
    'Feature highlight': `Quick tip: Use ${context.keyFeatures[0]} in ${context.productName} to save hours every week.

Try it: [link]`,
    'Quick tip': `💡 ${context.brandTone === 'professional' ? 'Pro' : 'Quick'} tip:

${context.keyFeatures[1] || 'Our solution'} can help you ${context.targetAudience.desiredOutcome}.

What's your biggest challenge with this?`,
    'Behind-the-scenes': `Building ${context.productName} in public.

Today's focus: ${context.keyFeatures[0]}

Here's what I learned 🧵`,
    'Customer insight': `"${context.uniqueValueProp}"

This is what our users say about ${context.productName}.

What would you want to see improved?`,
    'Industry trend': `The ${context.businessType} industry is changing fast.

Here's what I'm seeing:
→ ${context.keyFeatures[0]}
→ ${context.keyFeatures[1] || 'Better solutions'}

Thoughts?`,
    'Week recap + CTA': `This week at ${context.productName}:

✅ Shipped new features
✅ Helped more customers
✅ Built something cool

Try it free 👇`,
  };

  return templates[topic] || `Excited about ${context.productName}! ${context.uniqueValueProp}`;
}

function generateHashtags(context: InfrastructureContext): string[] {
  const baseHashtags: Record<string, string[]> = {
    saas: ['#SaaS', '#Startup', '#ProductLaunch', '#B2B', '#Tech'],
    creator: ['#CreatorEconomy', '#ContentCreator', '#BuildInPublic', '#IndieHacker'],
    services: ['#Freelance', '#Agency', '#Consulting', '#B2B', '#ClientWork'],
    ecommerce: ['#SmallBusiness', '#ShopSmall', '#Ecommerce', '#OnlineStore'],
  };

  const industryHashtags = baseHashtags[context.businessType] || baseHashtags.saas;

  // Add product-specific hashtag
  const productHashtag = `#${context.productName.replace(/[^a-zA-Z0-9]/g, '')}`;

  return [productHashtag, ...industryHashtags];
}

function generateGrowthTactics(context: InfrastructureContext): string[] {
  const tactics: Record<string, string[]> = {
    saas: [
      'Engage with target audience tweets daily (spend 30 min)',
      'Reply to competitor mentions with helpful advice',
      'Join Twitter Spaces in your niche weekly',
      'Cross-promote with complementary tools',
      'Share customer wins and tag them',
      'Create weekly threads on industry topics',
      'Run giveaways for early adopters',
    ],
    creator: [
      'Reply to every comment within 2 hours',
      'Collaborate with creators in adjacent niches',
      'Share exclusive previews on Twitter',
      'Host weekly Twitter Spaces Q&As',
      'Retweet and celebrate follower content',
      'Create shareable quote graphics',
      'Tease upcoming content to build anticipation',
    ],
    services: [
      'Share case studies as threads weekly',
      'Offer free audits to build credibility',
      'Engage in industry conversations',
      'Partner with complementary service providers',
      'Answer questions in your expertise area',
      'Share client testimonials (with permission)',
      'Create helpful resource threads',
    ],
    ecommerce: [
      'Feature customer photos and UGC',
      'Run exclusive Twitter-only flash sales',
      'Engage with lifestyle/aesthetic accounts',
      'Partner with micro-influencers',
      'Share product development stories',
      'Create gift guides for seasons/occasions',
      'Host giveaways to boost engagement',
    ],
  };

  return tactics[context.businessType] || tactics.saas;
}

function generateFallbackContent(context: InfrastructureContext): SocialContent {
  const template = SOCIAL_TEMPLATES[context.businessType];

  return {
    twitter: {
      bio: generateDefaultBio(context, template),
      pinnedTweet: generateDefaultPinnedTweet(context),
      headerImagePrompt: `Modern header image for ${context.productName}. ${context.businessType} business.`,
      contentCalendar: generateDefaultCalendar(context),
      hashtagStrategy: generateHashtags(context),
      competitorAccounts: [],
      growthTactics: generateGrowthTactics(context),
    },
    linkedin: {
      bio: `${context.productName} - ${context.uniqueValueProp}`,
      headline: `Helping ${context.targetAudience.demographics}`,
      contentIdeas: ['Company updates', 'Industry insights', 'Team highlights'],
    },
  };
}

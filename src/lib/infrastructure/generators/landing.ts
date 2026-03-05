/**
 * Landing Page Generator
 *
 * Uses Echo (Marketing) + Prism (Product) agents to generate
 * conversion-optimized landing page content.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { InfrastructureContext, InfraResult, LandingPageContent } from '../types';
import { LANDING_PAGE_TEMPLATES } from '../templates/business-templates';

const anthropic = new Anthropic();

const LANDING_PAGE_PROMPT = `You are generating landing page content for a business. Generate compelling, conversion-optimized content.

Business Context:
- Type: {businessType}
- Product: {productName}
- Description: {businessDescription}
- Target Audience: {targetAudience}
- Key Features: {keyFeatures}
- Value Proposition: {uniqueValueProp}
- Brand Tone: {brandTone}
- Competitors: {competitors}

Template Structure: {sections}

Generate a complete landing page with the following JSON structure:

{
  "hero": {
    "headline": "Main headline (max 10 words, benefit-focused)",
    "subheadline": "Supporting text (max 25 words)",
    "ctaText": "Primary CTA button text",
    "ctaUrl": "#signup"
  },
  "features": [
    {
      "title": "Feature name",
      "description": "Feature benefit (1-2 sentences)",
      "icon": "Lucide icon name (e.g., Zap, Shield, BarChart)"
    }
  ],
  "socialProof": [
    {
      "type": "stat",
      "content": "1000+ users trust us"
    }
  ],
  "faq": [
    {
      "question": "Common question",
      "answer": "Clear, concise answer"
    }
  ],
  "footer": {
    "tagline": "Short tagline",
    "links": [{"label": "Link text", "url": "/path"}]
  },
  "styling": {
    "colorScheme": "Color scheme name",
    "fontPairing": "Font pairing suggestion"
  }
}

Important:
- Write in {brandTone} tone
- Focus on benefits, not features
- Use power words and action verbs
- Include 4-6 features
- Include 4-6 FAQ items
- Make CTAs action-oriented
- Social proof should be realistic but aspirational`;

const COMPONENT_CODE_PROMPT = `Generate a React component for this landing page content. Use:
- Next.js 14+ patterns (App Router)
- Tailwind CSS for styling
- Framer Motion for animations
- Lucide React for icons
- Dark theme with these colors: primary {primaryColor}, accent {accentColor}

Content to render:
{content}

Generate clean, production-ready TypeScript React code. Include:
- Proper TypeScript types
- Responsive design (mobile-first)
- Smooth scroll behavior
- Accessible markup
- SEO-friendly structure

Return only the component code, no explanations.`;

export async function generateLandingPage(
  context: InfrastructureContext,
  companyId: string,
  onProgress: (agent: string | null, progress: number) => void
): Promise<InfraResult<LandingPageContent>> {
  const startTime = Date.now();
  let tokensUsed = 0;

  try {
    // Get template for business type
    const template = LANDING_PAGE_TEMPLATES[context.businessType];
    const colorScheme = template.colorSchemes[0];

    // Step 1: Generate content (Echo - Marketing)
    onProgress('marketing', 20);

    const contentPrompt = LANDING_PAGE_PROMPT
      .replace('{businessType}', context.businessType)
      .replace('{productName}', context.productName)
      .replace('{businessDescription}', context.businessDescription)
      .replace('{targetAudience}', JSON.stringify(context.targetAudience))
      .replace('{keyFeatures}', context.keyFeatures.join(', '))
      .replace('{uniqueValueProp}', context.uniqueValueProp)
      .replace('{brandTone}', context.brandTone)
      .replace('{competitors}', context.competitors.map((c) => c.name).join(', ') || 'Not specified')
      .replace('{sections}', template.sections.join(', '))
      .replace('{brandTone}', context.brandTone);

    const contentResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: contentPrompt,
        },
      ],
    });

    tokensUsed += contentResponse.usage.input_tokens + contentResponse.usage.output_tokens;
    onProgress('marketing', 50);

    // Parse content response
    const contentText = contentResponse.content[0].type === 'text' ? contentResponse.content[0].text : '';
    let parsedContent: Partial<LandingPageContent>;

    try {
      // Extract JSON from response
      const jsonMatch = contentText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedContent = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch {
      // Fallback content
      parsedContent = generateFallbackContent(context);
    }

    // Step 2: Generate component code (Prism - Product)
    onProgress('product', 70);

    const codePrompt = COMPONENT_CODE_PROMPT
      .replace('{primaryColor}', colorScheme.primary)
      .replace('{accentColor}', colorScheme.accent)
      .replace('{content}', JSON.stringify(parsedContent, null, 2));

    const codeResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: codePrompt,
        },
      ],
    });

    tokensUsed += codeResponse.usage.input_tokens + codeResponse.usage.output_tokens;
    onProgress('product', 90);

    const componentCode = codeResponse.content[0].type === 'text' ? codeResponse.content[0].text : '';

    // Combine results
    const finalContent: LandingPageContent = {
      hero: parsedContent.hero || {
        headline: `${context.productName} - ${context.uniqueValueProp}`,
        subheadline: context.businessDescription.substring(0, 100),
        ctaText: 'Get Started',
        ctaUrl: '#signup',
      },
      features: parsedContent.features || context.keyFeatures.map((f, i) => ({
        title: f,
        description: `Experience the power of ${f.toLowerCase()}`,
        icon: ['Zap', 'Shield', 'BarChart', 'Users', 'Globe', 'Sparkles'][i] || 'Star',
      })),
      socialProof: parsedContent.socialProof || [
        { type: 'stat', content: 'Join thousands of happy users' },
      ],
      faq: parsedContent.faq || [
        { question: 'How do I get started?', answer: 'Sign up for a free trial and explore all features.' },
      ],
      footer: parsedContent.footer || {
        tagline: context.tagline,
        links: [
          { label: 'Privacy', url: '/privacy' },
          { label: 'Terms', url: '/terms' },
        ],
      },
      componentCode: extractCodeBlock(componentCode),
      styling: {
        colorScheme: colorScheme.name,
        fontPairing: 'Inter + Space Grotesk',
      },
    };

    onProgress(null, 100);

    return {
      success: true,
      type: 'landing',
      content: finalContent,
      metadata: {
        generatedAt: new Date().toISOString(),
        agentsUsed: ['marketing', 'product'],
        tokensUsed,
        version: 1,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      type: 'landing',
      content: generateFallbackContent(context) as LandingPageContent,
      metadata: {
        generatedAt: new Date().toISOString(),
        agentsUsed: ['marketing', 'product'],
        tokensUsed,
        version: 1,
      },
      error: errorMessage,
    };
  }
}

function generateFallbackContent(context: InfrastructureContext): Partial<LandingPageContent> {
  return {
    hero: {
      headline: context.productName,
      subheadline: context.uniqueValueProp,
      ctaText: 'Get Started Free',
      ctaUrl: '#signup',
    },
    features: context.keyFeatures.slice(0, 4).map((f, i) => ({
      title: f,
      description: `Powerful ${f.toLowerCase()} capabilities for your business.`,
      icon: ['Zap', 'Shield', 'BarChart', 'Users'][i] || 'Star',
    })),
    socialProof: [
      { type: 'stat' as const, content: 'Trusted by businesses worldwide' },
    ],
    faq: [
      {
        question: `What is ${context.productName}?`,
        answer: context.businessDescription,
      },
      {
        question: 'How do I get started?',
        answer: 'Simply sign up for an account and follow our quick setup guide.',
      },
    ],
    footer: {
      tagline: context.tagline,
      links: [
        { label: 'Privacy Policy', url: '/privacy' },
        { label: 'Terms of Service', url: '/terms' },
        { label: 'Contact', url: '/contact' },
      ],
    },
    styling: {
      colorScheme: 'modern',
      fontPairing: 'Inter + Space Grotesk',
    },
  };
}

function extractCodeBlock(text: string): string {
  // Extract code from markdown code blocks
  const codeBlockMatch = text.match(/```(?:tsx?|jsx?|typescript|javascript)?\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }
  return text.trim();
}

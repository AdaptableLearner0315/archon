/**
 * FAQ/Help Center Generator
 *
 * Uses Shield (Support) + Prism (Product) agents to generate
 * initial FAQs and help center structure.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { InfrastructureContext, InfraResult, FAQContent } from '../types';
import { FAQ_CATEGORY_TEMPLATES } from '../templates/business-templates';

const anthropic = new Anthropic();

const FAQ_GENERATION_PROMPT = `You are generating FAQ content for a {businessType} business.

Business: {productName}
Description: {businessDescription}
Key Features: {keyFeatures}
Target Audience: {targetAudience}
Value Proposition: {uniqueValueProp}

Categories: {categories}

Generate comprehensive FAQ content as JSON:

{
  "faqs": [
    {
      "category": "category-slug",
      "question": "Clear, specific question",
      "answer": "Helpful, complete answer (2-4 sentences)",
      "keywords": ["keyword1", "keyword2"],
      "relatedQuestions": ["Related question 1", "Related question 2"]
    }
  ]
}

Requirements:
- Generate 4-5 FAQs per category
- Questions should be what real customers ask
- Answers should be helpful and actionable
- Include relevant keywords for search
- Link related questions for navigation
- Cover: getting started, features, pricing, troubleshooting`;

export async function generateFAQContent(
  context: InfrastructureContext,
  companyId: string,
  onProgress: (agent: string | null, progress: number) => void
): Promise<InfraResult<FAQContent>> {
  const startTime = Date.now();
  let tokensUsed = 0;

  try {
    // Get category template
    const categories = FAQ_CATEGORY_TEMPLATES[context.businessType];

    // Generate using Shield (Support) + Prism (Product) agents
    onProgress('support', 20);

    const prompt = FAQ_GENERATION_PROMPT
      .replace('{businessType}', context.businessType)
      .replace('{productName}', context.productName)
      .replace('{businessDescription}', context.businessDescription)
      .replace('{keyFeatures}', context.keyFeatures.join(', '))
      .replace('{targetAudience}', context.targetAudience.demographics)
      .replace('{uniqueValueProp}', context.uniqueValueProp)
      .replace('{categories}', categories.map((c) => `${c.slug}: ${c.description}`).join(', '));

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
    onProgress('product', 60);

    // Parse response
    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
    let generatedFaqs: { faqs?: FAQContent['faqs'] } = {};

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        generatedFaqs = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Use defaults
    }

    onProgress('support', 90);

    // Build final content
    const finalContent: FAQContent = {
      categories,
      faqs: generatedFaqs.faqs || generateDefaultFaqs(context, categories),
      searchConfig: {
        indexFields: ['question', 'answer', 'keywords'],
        synonyms: generateSynonyms(context),
      },
      analyticsTracking: {
        events: [
          'faq_viewed',
          'faq_helpful',
          'faq_not_helpful',
          'faq_search',
          'contact_support_clicked',
        ],
        implementation: generateAnalyticsCode(),
      },
    };

    onProgress(null, 100);

    return {
      success: true,
      type: 'faqs',
      content: finalContent,
      metadata: {
        generatedAt: new Date().toISOString(),
        agentsUsed: ['support', 'product'],
        tokensUsed,
        version: 1,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      type: 'faqs',
      content: generateFallbackContent(context),
      metadata: {
        generatedAt: new Date().toISOString(),
        agentsUsed: ['support', 'product'],
        tokensUsed,
        version: 1,
      },
      error: errorMessage,
    };
  }
}

function generateDefaultFaqs(
  context: InfrastructureContext,
  categories: typeof FAQ_CATEGORY_TEMPLATES.saas
): FAQContent['faqs'] {
  const faqs: FAQContent['faqs'] = [];

  // Generate FAQs for each category
  const faqTemplates: Record<string, { question: string; answer: string }[]> = {
    'getting-started': [
      {
        question: `How do I get started with ${context.productName}?`,
        answer: `Getting started is easy! Simply sign up for an account, and you'll be guided through our quick setup process. Most users are up and running within 5 minutes.`,
      },
      {
        question: `What do I need to use ${context.productName}?`,
        answer: `You only need a web browser to use ${context.productName}. We support all modern browsers including Chrome, Firefox, Safari, and Edge. No downloads or installations required.`,
      },
      {
        question: 'Is there a tutorial or onboarding guide?',
        answer: `Yes! When you first sign up, our onboarding wizard will walk you through the key features. We also have detailed documentation and video tutorials in our help center.`,
      },
    ],
    'account-billing': [
      {
        question: 'How do I upgrade my plan?',
        answer: `You can upgrade your plan anytime from the Settings > Billing page. Changes take effect immediately, and you'll be charged a prorated amount for the remainder of your billing period.`,
      },
      {
        question: 'Can I cancel my subscription?',
        answer: `Yes, you can cancel anytime from your account settings. Your access will continue until the end of your current billing period. We don't offer refunds for partial months.`,
      },
      {
        question: 'What payment methods do you accept?',
        answer: `We accept all major credit cards (Visa, MasterCard, American Express) and debit cards. For annual plans, we also support bank transfers and invoicing.`,
      },
    ],
    features: [
      {
        question: `What are the main features of ${context.productName}?`,
        answer: `${context.productName} includes ${context.keyFeatures.slice(0, 3).join(', ')}. ${context.uniqueValueProp}`,
      },
      {
        question: 'Can I integrate with other tools?',
        answer: `Yes! We offer integrations with popular tools. Check our Integrations page for the full list, or contact us if you need a specific integration.`,
      },
    ],
    troubleshooting: [
      {
        question: "I'm having trouble logging in. What should I do?",
        answer: `First, try resetting your password using the "Forgot Password" link. If that doesn't work, clear your browser cookies and try again. Still stuck? Contact support and we'll help you out.`,
      },
      {
        question: 'Why is the app running slowly?',
        answer: `Slow performance is usually due to browser extensions or a poor internet connection. Try disabling extensions, clearing your cache, or switching to a different browser.`,
      },
    ],
    subscription: [
      {
        question: 'What do I get with my subscription?',
        answer: `Your subscription gives you access to all premium content, exclusive updates, and community features. Check our membership page for the full breakdown of each tier.`,
      },
      {
        question: 'How do I access subscriber-only content?',
        answer: `Once you're subscribed, all premium content is automatically unlocked. Just make sure you're logged in to see the full library.`,
      },
    ],
    services: [
      {
        question: 'What services do you offer?',
        answer: `We offer ${context.keyFeatures.join(', ')}. Each engagement is customized to your specific needs. Contact us for a free consultation.`,
      },
      {
        question: 'How long does a typical project take?',
        answer: `Project timelines vary based on scope. Small projects typically take 1-2 weeks, while larger engagements can span several months. We'll provide a detailed timeline during our initial consultation.`,
      },
    ],
    ordering: [
      {
        question: 'How do I place an order?',
        answer: `Simply add items to your cart and proceed to checkout. You'll need to create an account or log in to complete your purchase. We accept all major credit cards.`,
      },
      {
        question: 'Can I modify my order after placing it?',
        answer: `You can modify your order within 1 hour of placing it. After that, please contact our support team, and we'll do our best to accommodate changes before shipping.`,
      },
    ],
    shipping: [
      {
        question: 'How long does shipping take?',
        answer: `Standard shipping takes 5-7 business days. Express shipping (2-3 days) is available at checkout. International shipping times vary by location.`,
      },
      {
        question: 'Do you ship internationally?',
        answer: `Yes, we ship to most countries worldwide. International shipping rates and times are calculated at checkout based on your location.`,
      },
    ],
    returns: [
      {
        question: 'What is your return policy?',
        answer: `We offer a 30-day return policy on all unused items in original packaging. Simply contact us to initiate a return, and we'll provide a prepaid shipping label.`,
      },
      {
        question: 'How do I request a refund?',
        answer: `Once we receive your returned item, we'll process your refund within 5-7 business days. Refunds are issued to the original payment method.`,
      },
    ],
  };

  for (const category of categories) {
    const categoryFaqs = faqTemplates[category.slug] || [];
    for (const faq of categoryFaqs) {
      faqs.push({
        category: category.slug,
        question: faq.question,
        answer: faq.answer,
        keywords: extractKeywords(faq.question + ' ' + faq.answer),
        relatedQuestions: [],
      });
    }
  }

  // Add related questions
  for (const faq of faqs) {
    const sameCategoryFaqs = faqs.filter(
      (f) => f.category === faq.category && f.question !== faq.question
    );
    faq.relatedQuestions = sameCategoryFaqs.slice(0, 2).map((f) => f.question);
  }

  return faqs;
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set(['a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'up', 'about', 'into', 'over', 'after', 'i', 'you', 'we', 'they', 'it', 'my', 'your', 'our', 'their', 'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom', 'how', 'when', 'where', 'why']);

  const words = text.toLowerCase().match(/\b[a-z]+\b/g) || [];
  const keywords = words.filter((word) => word.length > 3 && !stopWords.has(word));
  const uniqueKeywords = [...new Set(keywords)];

  return uniqueKeywords.slice(0, 5);
}

function generateSynonyms(context: InfrastructureContext): Record<string, string[]> {
  return {
    'account': ['profile', 'user', 'login'],
    'billing': ['payment', 'subscription', 'invoice', 'charge'],
    'cancel': ['stop', 'end', 'terminate', 'unsubscribe'],
    'help': ['support', 'assistance', 'contact'],
    'pricing': ['cost', 'price', 'plans', 'rates'],
    'upgrade': ['change plan', 'increase', 'improve'],
    'features': ['functionality', 'capabilities', 'tools'],
    [context.productName.toLowerCase()]: ['product', 'service', 'platform', 'app'],
  };
}

function generateAnalyticsCode(): string {
  return `// FAQ Analytics Implementation

interface FAQEvent {
  eventName: string;
  properties: {
    faqId?: string;
    question?: string;
    category?: string;
    searchQuery?: string;
    helpful?: boolean;
  };
}

// Track FAQ view
export function trackFAQView(faqId: string, question: string, category: string): void {
  analytics.track('faq_viewed', { faqId, question, category });
}

// Track helpfulness vote
export function trackFAQHelpfulness(faqId: string, helpful: boolean): void {
  analytics.track(helpful ? 'faq_helpful' : 'faq_not_helpful', { faqId, helpful });
}

// Track search
export function trackFAQSearch(query: string, resultsCount: number): void {
  analytics.track('faq_search', { searchQuery: query, resultsCount });
}

// Track contact support click
export function trackContactSupport(source: string): void {
  analytics.track('contact_support_clicked', { source });
}

// Example usage with Segment/Mixpanel/etc:
// import { analytics } from '@/lib/analytics';
// trackFAQView('faq-123', 'How do I get started?', 'getting-started');`;
}

function generateFallbackContent(context: InfrastructureContext): FAQContent {
  const categories = FAQ_CATEGORY_TEMPLATES[context.businessType];

  return {
    categories,
    faqs: generateDefaultFaqs(context, categories),
    searchConfig: {
      indexFields: ['question', 'answer', 'keywords'],
      synonyms: generateSynonyms(context),
    },
    analyticsTracking: {
      events: ['faq_viewed', 'faq_helpful', 'faq_not_helpful', 'faq_search'],
      implementation: generateAnalyticsCode(),
    },
  };
}

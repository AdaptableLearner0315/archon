import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createCreditManager } from '@/lib/credits/manager';
import { sendWelcomeEmail } from '@/lib/agents/notifications/welcome';
import { generateCompanyName } from '@/lib/onboarding/name-generator';
import { ATLAS_EXTRACTION_PROMPT } from '@/lib/onboarding/atlas-prompt';
import Anthropic from '@anthropic-ai/sdk';
import Stripe from 'stripe';

const anthropic = new Anthropic();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia' as Stripe.LatestApiVersion,
});

interface OnboardingCompleteRequest {
  conversationHistory: { role: string; content: string }[];
  selectedPackage: string | null;
}

interface ExtractedProfile {
  businessIdea?: string;
  businessIdeaSummary?: string;
  businessType?: 'saas' | 'creator' | 'services' | 'ecommerce';
  targetAudience?: { primary: string; painPoints?: string[] };
  competitors?: { name: string; strengths?: string[]; weaknesses?: string[]; weakness?: string }[];
  uniqueValueProp?: string;
  keyFeatures?: string[];
  brandTone?: 'professional' | 'casual' | 'playful' | 'technical';
  stage?: 'idea' | 'mvp' | 'launched' | 'revenue';
  teamSize?: number;
  founderSkills?: string[];
  hoursPerWeek?: number;
  riskTolerance?: 'low' | 'medium' | 'high';
  workingStyle?: 'move-fast' | 'balanced' | 'methodical';
  recommendedCredits?: number;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: OnboardingCompleteRequest = await request.json();
    const { conversationHistory, selectedPackage } = body;

    // Extract profile from conversation using Claude (falls back to keyword-based)
    const profile: ExtractedProfile = await extractProfileFromConversation(conversationHistory);

    // Generate intelligent company name via Claude
    const companyName = await generateCompanyName(profile.businessIdea || profile.businessIdeaSummary || '');

    // Generate company slug from business idea
    const slug =
      (profile.businessIdeaSummary || 'company')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50) +
      '-' +
      Math.random().toString(36).slice(2, 8);

    // Create company
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({
        user_id: user.id,
        name: companyName,
        slug,
        description: profile.businessIdea || '',
        goal: 'revenue',
        ad_budget: '$0',
        plan: 'starter', // Legacy field - kept for compatibility
      })
      .select()
      .single();

    if (companyError) {
      console.error('Company creation error:', companyError);
      return NextResponse.json(
        { error: 'Failed to create company' },
        { status: 500 }
      );
    }

    // Initialize credit balance with free trial credits
    const creditManager = createCreditManager(supabase);
    try {
      await creditManager.initializeBalance(company.id);
    } catch (creditError) {
      console.error('Credit initialization error:', creditError);
      // Don't fail the entire onboarding - continue with 0 credits
      // User can purchase credits from dashboard
    }

    // Store onboarding profile with infrastructure context
    await supabase.from('onboarding_profiles').insert({
      company_id: company.id,
      business_idea: profile.businessIdea,
      business_idea_summary: profile.businessIdeaSummary,
      business_type: profile.businessType || 'saas',
      target_audience: profile.targetAudience,
      competitors: profile.competitors,
      unique_value_prop: profile.uniqueValueProp,
      key_features: profile.keyFeatures,
      brand_tone: profile.brandTone || 'casual',
      stage: profile.stage || 'idea',
      team_size: profile.teamSize || 1,
      founder_skills: profile.founderSkills,
      hours_per_week: profile.hoursPerWeek,
      risk_tolerance: profile.riskTolerance,
      working_style: profile.workingStyle,
      recommended_credits: profile.recommendedCredits,
      conversation_log: conversationHistory,
    });

    // Store profile in long-term memory for all agents
    await supabase.from('agent_memory_long_term').insert({
      company_id: company.id,
      agent_role: 'ceo',
      category: 'company_knowledge',
      summary: `Business: ${profile.businessIdea}. Target: ${profile.targetAudience?.primary || 'Not specified'}. Stage: ${profile.stage || 'idea'}. Founder skills: ${profile.founderSkills?.join(', ') || 'Not specified'}. Working style: ${profile.workingStyle || 'balanced'}.`,
      confidence: 0.95,
    });

    // Create initial metrics
    await supabase.from('metrics').insert({
      company_id: company.id,
      revenue: 0,
      users_count: 0,
      signups_today: 0,
      churn_rate: 0,
      conversion_rate: 0,
      nps_score: 0,
    });

    // Create initial activity
    await supabase.from('agent_activities').insert({
      company_id: company.id,
      agent_role: 'ceo',
      agent_name: 'Atlas',
      action: 'Organization initialized',
      detail: `Archon AI organization created for "${profile.businessIdeaSummary || profile.businessIdea}". All agents are spinning up and analyzing your business context.`,
      type: 'milestone',
    });

    // Initialize notification preferences
    await supabase.from('notification_preferences').insert({
      company_id: company.id,
      email_enabled: true,
      email_address: user.email,
      webapp_enabled: true,
    });

    // Send welcome email (fire-and-forget)
    if (user.email) {
      // Extract insight markers from Atlas's conversation messages
      const atlasMessages = conversationHistory
        .filter((m) => m.role === 'assistant' || m.role === 'atlas')
        .map((m) => m.content)
        .join(' ');

      const marketSizeMatch = atlasMessages.match(/\[INSIGHT:marketSize=([^\]]+)\]/);
      const gapMatch = atlasMessages.match(/\[INSIGHT:gap=([^\]]+)\]/);
      const competitorMatches = [...atlasMessages.matchAll(/\[INSIGHT:competitor=([^|]+)\|[^\]]+\]/g)];

      // Derive display name from email
      const userName = user.email
        .split('@')[0]
        .replace(/[._-]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());

      sendWelcomeEmail({
        toEmail: user.email,
        userName,
        companyName: profile.businessIdeaSummary || profile.businessIdea || 'Your Company',
        businessIdea: profile.businessIdea || 'your business',
        competitors: competitorMatches.map((m) => ({ name: m[1] })),
        gap: gapMatch?.[1] || profile.uniqueValueProp || null,
        marketSize: marketSizeMatch?.[1] || null,
        dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://archon.app'}/dashboard`,
      }).catch(console.error); // fire-and-forget
    }

    // If user selected a package, create Stripe checkout session
    if (selectedPackage) {
      // Get package details
      const { data: pkg } = await supabase
        .from('credit_packages')
        .select('stripe_price_id, price_cents, name')
        .eq('id', selectedPackage)
        .single();

      if (pkg?.stripe_price_id) {
        const session = await stripe.checkout.sessions.create({
          customer_email: user.email ?? undefined,
          line_items: [
            {
              price: pkg.stripe_price_id,
              quantity: 1,
            },
          ],
          mode: 'payment',
          success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?credits=success`,
          cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
          metadata: {
            company_id: company.id,
            package_id: selectedPackage,
          },
        });

        return NextResponse.json({
          success: true,
          profile,
          companyId: company.id,
          checkoutUrl: session.url,
        });
      }
    }

    return NextResponse.json({
      success: true,
      profile,
      companyId: company.id,
      redirectUrl: '/dashboard',
    });
  } catch (error) {
    console.error('Onboarding complete error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function extractProfileFromConversation(
  conversation: { role: string; content: string }[]
): Promise<ExtractedProfile> {
  // Try Claude-powered extraction first
  try {
    const conversationText = conversation
      .map((m) => `${m.role === 'user' ? 'Founder' : 'Atlas'}: ${m.content}`)
      .join('\n\n');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: `${ATLAS_EXTRACTION_PROMPT}\n\nConversation:\n${conversationText}`,
        },
      ],
    });

    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const extracted = JSON.parse(jsonMatch[0]);

      return {
        businessIdea: extracted.businessDescription || '',
        businessIdeaSummary: extracted.businessSummary || '',
        businessType: extracted.businessType || 'saas',
        targetAudience: extracted.targetAudience || undefined,
        competitors: extracted.competitors || undefined,
        uniqueValueProp: extracted.uniqueValueProp || undefined,
        keyFeatures: extracted.keyFeatures || undefined,
        brandTone: extracted.brandTone || 'casual',
        stage: extracted.stage || 'idea',
        teamSize: 1,
        workingStyle: 'balanced',
        founderSkills: extracted.founderBackground ? [extracted.founderBackground] : undefined,
      };
    }
  } catch (error) {
    console.error('Claude extraction failed, falling back to keyword-based:', error);
  }

  // Fallback: keyword-based extraction
  return extractProfileKeywordBased(conversation);
}

function extractProfileKeywordBased(
  conversation: { role: string; content: string }[]
): ExtractedProfile {
  const userMessages = conversation
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join(' ');

  const lowerContent = userMessages.toLowerCase();

  const profile: ExtractedProfile = {
    businessIdea: userMessages.slice(0, 200),
    businessIdeaSummary: userMessages.split(' ').slice(0, 5).join(' '),
    stage: 'idea',
    teamSize: 1,
  };

  if (lowerContent.includes('content') || lowerContent.includes('creator') || lowerContent.includes('course') || lowerContent.includes('newsletter')) {
    profile.businessType = 'creator';
  } else if (lowerContent.includes('agency') || lowerContent.includes('consulting') || lowerContent.includes('freelance') || lowerContent.includes('service') || lowerContent.includes('client')) {
    profile.businessType = 'services';
  } else if (lowerContent.includes('shop') || lowerContent.includes('store') || lowerContent.includes('product') || lowerContent.includes('ecommerce') || lowerContent.includes('inventory')) {
    profile.businessType = 'ecommerce';
  } else {
    profile.businessType = 'saas';
  }

  if (lowerContent.includes('revenue') || lowerContent.includes('paying customer')) {
    profile.stage = 'revenue';
  } else if (lowerContent.includes('launched') || lowerContent.includes('live')) {
    profile.stage = 'launched';
  } else if (lowerContent.includes('mvp') || lowerContent.includes('prototype')) {
    profile.stage = 'mvp';
  }

  if (lowerContent.includes('fast') || lowerContent.includes('aggressive')) {
    profile.workingStyle = 'move-fast';
  } else if (lowerContent.includes('careful') || lowerContent.includes('methodical')) {
    profile.workingStyle = 'methodical';
  } else {
    profile.workingStyle = 'balanced';
  }

  if (lowerContent.includes('enterprise') || lowerContent.includes('b2b') || lowerContent.includes('professional')) {
    profile.brandTone = 'professional';
  } else if (lowerContent.includes('fun') || lowerContent.includes('game') || lowerContent.includes('social')) {
    profile.brandTone = 'playful';
  } else if (lowerContent.includes('developer') || lowerContent.includes('api') || lowerContent.includes('technical')) {
    profile.brandTone = 'technical';
  } else {
    profile.brandTone = 'casual';
  }

  const keyFeatures: string[] = [];
  if (lowerContent.includes('automat')) keyFeatures.push('Automation');
  if (lowerContent.includes('ai') || lowerContent.includes('intelligent')) keyFeatures.push('AI-Powered');
  if (lowerContent.includes('analytic') || lowerContent.includes('insight')) keyFeatures.push('Analytics');
  if (lowerContent.includes('collaborat') || lowerContent.includes('team')) keyFeatures.push('Collaboration');
  if (lowerContent.includes('integrat')) keyFeatures.push('Integrations');
  if (keyFeatures.length > 0) {
    profile.keyFeatures = keyFeatures;
  }

  return profile;
}

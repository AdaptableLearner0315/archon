/**
 * Surprise Me Confirm API
 *
 * POST /api/onboarding/surprise/confirm
 * Takes the user-approved concept and creates the company + onboarding profile.
 * Reuses the same patterns as /api/onboarding/complete.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createCreditManager } from '@/lib/credits/manager';
import { sendWelcomeEmail } from '@/lib/agents/notifications/welcome';
import { seedMemoriesFromSurprise } from '@/lib/memory/seed';

interface SurpriseConcept {
  companyName: string;
  businessDescription: string;
  businessType: 'saas' | 'creator' | 'services' | 'ecommerce';
  targetAudience: {
    primary: string;
    painPoints: string[];
  };
  competitors: { name: string; weakness: string }[];
  keyFeatures: string[];
  uniqueValueProp: string;
  brandTone: 'professional' | 'casual' | 'playful' | 'technical';
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

    const { concept }: { concept: SurpriseConcept } = await request.json();

    if (!concept || !concept.companyName) {
      return NextResponse.json({ error: 'Invalid concept data' }, { status: 400 });
    }

    // Check if company already exists
    const { data: existingCompanies } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', user.id)
      .limit(1);

    if (existingCompanies?.[0]) {
      return NextResponse.json({
        success: true,
        companyId: existingCompanies[0].id,
        redirectUrl: '/dashboard',
      });
    }

    // Generate slug
    const slug =
      concept.companyName
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
        name: concept.companyName,
        slug,
        description: concept.businessDescription,
        goal: 'revenue',
        ad_budget: '$0',
        plan: 'starter',
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

    // Initialize credit balance
    try {
      const creditManager = createCreditManager(supabase);
      await creditManager.initializeBalance(company.id);
    } catch (creditError) {
      console.error('Credit initialization error:', creditError);
    }

    // Store onboarding profile — skipped=true but with full data
    await supabase.from('onboarding_profiles').insert({
      company_id: company.id,
      business_idea: concept.businessDescription,
      business_idea_summary: concept.companyName,
      business_type: concept.businessType,
      target_audience: concept.targetAudience,
      competitors: concept.competitors,
      unique_value_prop: concept.uniqueValueProp,
      key_features: concept.keyFeatures,
      brand_tone: concept.brandTone,
      stage: 'idea',
      team_size: 1,
      skipped: true,
    });

    // Seed cognitive memories from the generated concept
    const seedResult = await seedMemoriesFromSurprise(supabase, company.id, {
      name: concept.companyName,
      description: concept.businessDescription,
      businessType: concept.businessType,
      targetAudience: concept.targetAudience.primary,
      competitors: concept.competitors,
      keyFeatures: concept.keyFeatures,
      uniqueValueProp: concept.uniqueValueProp,
      brandTone: concept.brandTone,
    });
    console.log(`[Surprise] Seeded ${seedResult.total} cognitive memories for company ${company.id}`);

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
      detail: `Archon AI organization created for "${concept.companyName}" — ${concept.businessDescription}. All agents are spinning up.`,
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
      const userName = user.email
        .split('@')[0]
        .replace(/[._-]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());

      sendWelcomeEmail({
        toEmail: user.email,
        userName,
        companyName: concept.companyName,
        businessIdea: concept.businessDescription,
        competitors: concept.competitors.map((c) => ({ name: c.name })),
        gap: concept.uniqueValueProp,
        marketSize: null,
        dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://archon.app'}/dashboard`,
      }).catch(console.error);
    }

    return NextResponse.json({
      success: true,
      companyId: company.id,
      profile: {
        businessIdea: concept.businessDescription,
        businessIdeaSummary: concept.companyName,
        businessType: concept.businessType,
        targetAudience: concept.targetAudience,
        competitors: concept.competitors,
        uniqueValueProp: concept.uniqueValueProp,
        keyFeatures: concept.keyFeatures,
        brandTone: concept.brandTone,
      },
      redirectUrl: '/dashboard',
    });
  } catch (error) {
    console.error('Surprise confirm error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

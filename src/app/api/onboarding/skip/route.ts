import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createCreditManager } from '@/lib/credits/manager';

/**
 * Skip onboarding - create company with default profile
 * Sets profileIncomplete flag for dashboard notification nudge
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if company already exists (use limit(1) to handle multiple companies gracefully)
    const { data: existingCompanies } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1);

    const existingCompany = existingCompanies?.[0];

    if (existingCompany) {
      return NextResponse.json({
        success: true,
        companyId: existingCompany.id,
        redirectUrl: '/dashboard',
      });
    }

    // Generate default slug
    const slug = `company-${Math.random().toString(36).slice(2, 10)}`;

    // Create company with default profile
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({
        user_id: user.id,
        name: 'My Company',
        slug,
        description: '',
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

    console.log('Company created with ID:', company.id);

    // Verify the company can be read back (catches RLS issues, silent failures)
    const { data: verifyCompany, error: verifyError } = await supabase
      .from('companies')
      .select('id')
      .eq('id', company.id)
      .single();

    if (verifyError || !verifyCompany) {
      console.error('Company verification failed:', {
        verifyError,
        companyId: company.id,
        userId: user.id,
      });
      return NextResponse.json(
        { error: 'Company creation could not be verified' },
        { status: 500 }
      );
    }

    console.log('Company verified successfully:', verifyCompany.id);

    // Initialize credit balance (non-blocking - table may not exist)
    try {
      const creditManager = createCreditManager(supabase);
      await creditManager.initializeBalance(company.id);
    } catch (err) {
      console.warn('Credit initialization skipped:', err);
    }

    // Create minimal onboarding profile
    const { error: profileError } = await supabase.from('onboarding_profiles').insert({
      company_id: company.id,
      stage: 'idea',
      team_size: 1,
      skipped: true,
    });

    if (profileError) {
      console.warn('Onboarding profile insert failed (non-critical):', profileError);
    }

    // Create initial metrics
    const { error: metricsError } = await supabase.from('metrics').insert({
      company_id: company.id,
      revenue: 0,
      users_count: 0,
      signups_today: 0,
      churn_rate: 0,
      conversion_rate: 0,
      nps_score: 0,
    });

    if (metricsError) {
      console.warn('Metrics insert failed (non-critical):', metricsError);
    }

    // Initialize notification preferences
    const { error: notifError } = await supabase.from('notification_preferences').insert({
      company_id: company.id,
      email_enabled: true,
      email_address: user.email,
      webapp_enabled: true,
    });

    if (notifError) {
      console.warn('Notification preferences insert failed (non-critical):', notifError);
    }

    // Create initial activity
    const { error: activityError } = await supabase.from('agent_activities').insert({
      company_id: company.id,
      agent_role: 'ceo',
      agent_name: 'Atlas',
      action: 'Organization initialized',
      detail: 'Archon AI organization created. Complete your profile in settings for a personalized experience.',
      type: 'milestone',
    });

    if (activityError) {
      console.warn('Agent activity insert failed (non-critical):', activityError);
    }

    console.log('Skip onboarding completed successfully for company:', company.id);

    return NextResponse.json({
      success: true,
      companyId: company.id,
      redirectUrl: '/dashboard',
      debug: {
        userId: user.id,
        userEmail: user.email,
        companyUserId: company.user_id,
        companyName: company.name,
      },
    });
  } catch (error) {
    console.error('Skip onboarding error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

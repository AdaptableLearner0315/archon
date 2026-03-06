import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { seedMemoriesFromOnboarding } from '@/lib/memory/seed';

interface ReseedRequest {
  companyId: string;
}

/**
 * Re-seed cognitive memories from an updated onboarding profile.
 * Archives existing onboarding-sourced memories and creates fresh ones.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: ReseedRequest = await request.json();
    const { companyId } = body;

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID required' }, { status: 400 });
    }

    // Verify user owns this company
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .eq('user_id', user.id)
      .single();

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Load the current onboarding profile
    const { data: profile, error: profileError } = await supabase
      .from('onboarding_profiles')
      .select('*')
      .eq('company_id', companyId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Archive existing onboarding-sourced memories
    const { error: archiveError } = await supabase
      .from('company_memories')
      .update({ is_archived: true, updated_at: new Date().toISOString() })
      .eq('company_id', companyId)
      .eq('source', 'onboarding')
      .eq('is_archived', false);

    if (archiveError) {
      console.error('Failed to archive existing memories:', archiveError);
      // Continue anyway - we can still create new memories
    }

    // Convert database profile to the format expected by seedMemoriesFromOnboarding
    const profileForSeeding = {
      businessIdea: profile.business_idea || undefined,
      businessIdeaSummary: profile.business_idea_summary || undefined,
      businessType: profile.business_type || undefined,
      targetAudience: profile.target_audience || undefined,
      competitors: profile.competitors || undefined,
      uniqueValueProp: profile.unique_value_prop || undefined,
      keyFeatures: profile.key_features || undefined,
      brandTone: profile.brand_tone || undefined,
      stage: profile.stage || undefined,
      teamSize: profile.team_size || undefined,
      founderSkills: profile.founder_skills || undefined,
      workingStyle: profile.working_style || undefined,
    };

    // Seed new memories from the updated profile
    const seedResult = await seedMemoriesFromOnboarding(supabase, companyId, profileForSeeding);

    console.log(`[Reseed] Re-seeded ${seedResult.total} cognitive memories for company ${companyId}`);

    // Log an activity for this action
    await supabase.from('agent_activities').insert({
      company_id: companyId,
      agent_role: 'ceo',
      agent_name: 'Atlas',
      action: 'Profile memories updated',
      detail: `Business profile was updated. ${seedResult.total} facts have been synchronized with the AI team.`,
      type: 'status',
    });

    return NextResponse.json({
      success: true,
      total: seedResult.total,
      byDomain: seedResult.byDomain,
    });
  } catch (error) {
    console.error('Reseed memories error:', error);
    return NextResponse.json(
      { error: 'Failed to reseed memories' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface RestartRequest {
  companyId: string;
}

/**
 * Restart onboarding by archiving existing memories and resetting profile.
 * This allows users to "re-introduce" themselves when their business pivots.
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

    const body: RestartRequest = await request.json();
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

    // Archive all existing memories (both onboarding and agent-generated)
    const { data: archivedMemories, error: archiveError } = await supabase
      .from('company_memories')
      .update({ is_archived: true, updated_at: new Date().toISOString() })
      .eq('company_id', companyId)
      .eq('is_archived', false)
      .select('id');

    if (archiveError) {
      console.error('Failed to archive memories:', archiveError);
    }

    const archivedCount = archivedMemories?.length || 0;

    // Reset onboarding profile to allow fresh start
    const { error: profileError } = await supabase
      .from('onboarding_profiles')
      .update({
        business_idea: null,
        business_idea_summary: null,
        business_type: null,
        target_audience: null,
        competitors: null,
        unique_value_prop: null,
        key_features: null,
        brand_tone: null,
        stage: null,
        founder_skills: null,
        working_style: null,
        skipped: false,
        conversation_log: null,
      })
      .eq('company_id', companyId);

    if (profileError) {
      console.error('Failed to reset profile:', profileError);
    }

    // Log an activity for this action
    await supabase.from('agent_activities').insert({
      company_id: companyId,
      agent_role: 'ceo',
      agent_name: 'Atlas',
      action: 'Profile reset initiated',
      detail: `Business profile reset requested. ${archivedCount} memories archived. Ready for re-onboarding.`,
      type: 'status',
    });

    return NextResponse.json({
      success: true,
      archivedMemories: archivedCount,
      redirectUrl: '/onboarding?restart=true',
    });
  } catch (error) {
    console.error('Restart onboarding error:', error);
    return NextResponse.json(
      { error: 'Failed to restart onboarding' },
      { status: 500 }
    );
  }
}

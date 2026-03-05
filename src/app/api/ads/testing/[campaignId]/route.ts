/**
 * Campaign-specific Operations API
 * GET /api/ads/testing/[campaignId] - Get campaign details
 * PATCH /api/ads/testing/[campaignId] - Update campaign
 * DELETE /api/ads/testing/[campaignId] - Delete campaign
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getCampaign,
  getCampaignSummary,
  updateCampaign,
  deleteCampaign,
  startCampaign,
  pauseCampaign,
  resumeCampaign,
  completeCampaign,
} from '@/lib/agents/ads/testing/campaign-manager';
import { getCampaignPublications } from '@/lib/agents/ads/testing/publisher';
import { getCampaignWinner, analyzePerformance } from '@/lib/agents/ads/testing/winner-detector';

interface RouteContext {
  params: Promise<{ campaignId: string }>;
}

/**
 * GET /api/ads/testing/[campaignId]
 * Get campaign details with summary
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const { campaignId } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const view = searchParams.get('view') || 'summary'; // 'summary' | 'full' | 'analysis'

  try {
    // Get campaign and verify ownership
    const campaign = await getCampaign(campaignId, supabase);
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Verify user owns this company
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('id', campaign.companyId)
      .eq('user_id', user.id)
      .single();

    if (!company) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (view === 'analysis') {
      const analysis = await analyzePerformance(campaignId, supabase);
      return NextResponse.json({ campaign, analysis });
    }

    if (view === 'full') {
      const [publications, winner] = await Promise.all([
        getCampaignPublications(campaignId, supabase),
        getCampaignWinner(campaignId, supabase),
      ]);

      // Get creatives
      const { data: creatives } = await supabase
        .from('ad_creatives')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('concept_id')
        .order('variation_number');

      return NextResponse.json({
        campaign,
        creatives: creatives || [],
        publications,
        winner,
      });
    }

    // Default: summary view
    const summary = await getCampaignSummary(campaignId, supabase);
    return NextResponse.json(summary);
  } catch (error) {
    console.error('Failed to get campaign:', error);
    return NextResponse.json(
      { error: 'Failed to get campaign' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/ads/testing/[campaignId]
 * Update campaign or perform actions (start, pause, resume, complete)
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  const { campaignId } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, ...updates } = body;

    // Get campaign and verify ownership
    const campaign = await getCampaign(campaignId, supabase);
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('id', campaign.companyId)
      .eq('user_id', user.id)
      .single();

    if (!company) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Handle actions
    if (action) {
      switch (action) {
        case 'start': {
          const result = await startCampaign(campaignId, supabase);
          return NextResponse.json(result);
        }
        case 'pause': {
          await pauseCampaign(campaignId, supabase);
          return NextResponse.json({ success: true, message: 'Campaign paused' });
        }
        case 'resume': {
          await resumeCampaign(campaignId, supabase);
          return NextResponse.json({ success: true, message: 'Campaign resumed' });
        }
        case 'complete': {
          await completeCampaign(campaignId, supabase);
          return NextResponse.json({ success: true, message: 'Campaign completed' });
        }
        default:
          return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
      }
    }

    // Handle updates
    if (Object.keys(updates).length > 0) {
      const updatedCampaign = await updateCampaign(campaignId, updates, supabase);
      return NextResponse.json({ campaign: updatedCampaign });
    }

    return NextResponse.json({ error: 'No action or updates provided' }, { status: 400 });
  } catch (error) {
    console.error('Failed to update campaign:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update campaign' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/ads/testing/[campaignId]
 * Delete a campaign (only draft or failed)
 */
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  const { campaignId } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get campaign and verify ownership
    const campaign = await getCampaign(campaignId, supabase);
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('id', campaign.companyId)
      .eq('user_id', user.id)
      .single();

    if (!company) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    await deleteCampaign(campaignId, supabase);
    return NextResponse.json({ success: true, deleted: true });
  } catch (error) {
    console.error('Failed to delete campaign:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete campaign' },
      { status: 500 }
    );
  }
}

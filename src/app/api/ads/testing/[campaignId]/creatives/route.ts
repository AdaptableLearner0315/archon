/**
 * Creative Generation & Management API
 * POST /api/ads/testing/[campaignId]/creatives - Generate creatives
 * GET /api/ads/testing/[campaignId]/creatives - List creatives
 * PATCH /api/ads/testing/[campaignId]/creatives - Approve/reject creatives
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCampaign, updateCampaignStatus } from '@/lib/agents/ads/testing/campaign-manager';
import {
  generateAdConcepts,
  saveConceptsToDatabase,
  getPendingCreatives,
  approveCreatives,
  rejectCreatives,
  autoApproveAllCreatives,
  type GenerateConceptsOptions,
} from '@/lib/agents/ads/testing/creative-generator';
import type { CreativeFormat } from '@/lib/agents/ads/testing/types';

interface RouteContext {
  params: Promise<{ campaignId: string }>;
}

/**
 * POST /api/ads/testing/[campaignId]/creatives
 * Generate ad creatives using Claude
 */
export async function POST(
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

    if (!campaign.productInfo) {
      return NextResponse.json(
        { error: 'Campaign must have productInfo configured' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const {
      conceptCount = 3,
      variationsPerConcept = 2,
      formats = ['9:16', '1:1'],
      durations = ['30'],
    } = body;

    // Update campaign status to generating
    await updateCampaignStatus(campaignId, 'generating', supabase);

    // Generate concepts using Claude
    const options: GenerateConceptsOptions = {
      productInfo: campaign.productInfo,
      targeting: campaign.targeting || undefined,
      conceptCount,
      variationsPerConcept,
      formats: formats as CreativeFormat[],
      durations,
    };

    const result = await generateAdConcepts(options);

    // Save to database
    const creatives = await saveConceptsToDatabase(
      campaign.companyId,
      campaignId,
      result.concepts,
      formats as CreativeFormat[],
      supabase
    );

    // Auto-approve if configured
    let autoApproved = 0;
    if (campaign.autoApproveCreatives) {
      autoApproved = await autoApproveAllCreatives(campaignId, supabase);
    }

    // Reset campaign status to draft
    await updateCampaignStatus(campaignId, 'draft', supabase);

    return NextResponse.json({
      success: true,
      conceptsGenerated: result.concepts.length,
      creativesCreated: creatives.length,
      autoApproved,
      tokensUsed: result.tokensUsed,
      costUsd: result.costUsd,
      creatives,
    });
  } catch (error) {
    console.error('Failed to generate creatives:', error);

    // Reset campaign status on error
    try {
      await updateCampaignStatus(campaignId, 'draft', supabase);
    } catch {
      // Ignore status update errors
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate creatives' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ads/testing/[campaignId]/creatives
 * List creatives for a campaign
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
  const status = searchParams.get('status'); // pending, approved, rejected, published

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

    let query = supabase
      .from('ad_creatives')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('concept_id')
      .order('variation_number');

    if (status) {
      query = query.eq('status', status);
    }

    const { data: creatives, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    // Group by concept
    const concepts = new Map<string, typeof creatives>();
    for (const creative of creatives || []) {
      const existing = concepts.get(creative.concept_id) || [];
      existing.push(creative);
      concepts.set(creative.concept_id, existing);
    }

    return NextResponse.json({
      total: creatives?.length || 0,
      creatives,
      conceptGroups: Object.fromEntries(concepts),
    });
  } catch (error) {
    console.error('Failed to list creatives:', error);
    return NextResponse.json(
      { error: 'Failed to list creatives' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/ads/testing/[campaignId]/creatives
 * Approve or reject creatives
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

    const body = await request.json();
    const { action, creativeIds, reason } = body;

    if (!action || !creativeIds || !Array.isArray(creativeIds)) {
      return NextResponse.json(
        { error: 'action and creativeIds array are required' },
        { status: 400 }
      );
    }

    switch (action) {
      case 'approve':
        await approveCreatives(creativeIds, supabase);
        return NextResponse.json({
          success: true,
          action: 'approved',
          count: creativeIds.length,
        });

      case 'reject':
        if (!reason) {
          return NextResponse.json(
            { error: 'reason required for rejection' },
            { status: 400 }
          );
        }
        await rejectCreatives(creativeIds, reason, supabase);
        return NextResponse.json({
          success: true,
          action: 'rejected',
          count: creativeIds.length,
        });

      case 'approve_all':
        const count = await autoApproveAllCreatives(campaignId, supabase);
        return NextResponse.json({
          success: true,
          action: 'approved_all',
          count,
        });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Failed to update creatives:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update creatives' },
      { status: 500 }
    );
  }
}

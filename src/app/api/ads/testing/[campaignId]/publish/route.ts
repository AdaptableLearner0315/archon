/**
 * Publish Ads API
 * POST /api/ads/testing/[campaignId]/publish - Publish approved creatives to platforms
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCampaign, getApprovedCreatives, updateCampaignStatus } from '@/lib/agents/ads/testing/campaign-manager';
import { publishAllCreatives, getCampaignPublications } from '@/lib/agents/ads/testing/publisher';

interface RouteContext {
  params: Promise<{ campaignId: string }>;
}

/**
 * POST /api/ads/testing/[campaignId]/publish
 * Publish all approved creatives to TikTok and Meta
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

    // Check campaign status
    if (campaign.status !== 'draft' && campaign.status !== 'paused') {
      return NextResponse.json(
        { error: `Cannot publish from status: ${campaign.status}` },
        { status: 400 }
      );
    }

    // Check for approved creatives
    const approvedCreatives = await getApprovedCreatives(campaignId, supabase);
    if (approvedCreatives.length === 0) {
      return NextResponse.json(
        { error: 'No approved creatives to publish' },
        { status: 400 }
      );
    }

    // Publish to all platforms
    const result = await publishAllCreatives(campaignId, supabase);

    // Update campaign status to active if at least one publication succeeded
    if (result.successful > 0) {
      await updateCampaignStatus(campaignId, 'active', supabase);
    } else {
      await updateCampaignStatus(campaignId, 'failed', supabase);
    }

    return NextResponse.json({
      success: result.successful > 0,
      total: result.total,
      successful: result.successful,
      failed: result.failed,
      publications: result.publications,
      errors: result.errors,
      campaignStatus: result.successful > 0 ? 'active' : 'failed',
    });
  } catch (error) {
    console.error('Failed to publish ads:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to publish ads' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ads/testing/[campaignId]/publish
 * Get publication status for a campaign
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

    const publications = await getCampaignPublications(campaignId, supabase);

    // Group by status
    const byStatus = {
      pending: publications.filter(p => p.status === 'pending').length,
      creating: publications.filter(p => p.status === 'creating').length,
      active: publications.filter(p => p.status === 'active').length,
      paused: publications.filter(p => p.status === 'paused').length,
      failed: publications.filter(p => p.status === 'failed').length,
    };

    // Group by platform
    const byPlatform = {
      tiktok: publications.filter(p => p.platform === 'tiktok').length,
      meta: publications.filter(p => p.platform === 'meta').length,
    };

    // Calculate total budget
    const totalBudgetCents = publications
      .filter(p => p.status === 'active')
      .reduce((sum, p) => sum + p.dailyBudgetCents, 0);

    return NextResponse.json({
      total: publications.length,
      byStatus,
      byPlatform,
      totalDailyBudget: totalBudgetCents / 100,
      publications,
    });
  } catch (error) {
    console.error('Failed to get publications:', error);
    return NextResponse.json(
      { error: 'Failed to get publications' },
      { status: 500 }
    );
  }
}

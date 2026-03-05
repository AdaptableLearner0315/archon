/**
 * Ad Testing Campaign CRUD API
 * POST /api/ads/testing - Create new campaign
 * GET /api/ads/testing - List campaigns for company
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  createTestCampaign,
  getCampaigns,
  type CreateCampaignConfig,
} from '@/lib/agents/ads/testing/campaign-manager';

/**
 * POST /api/ads/testing
 * Create a new ad test campaign
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      companyId,
      name,
      totalBudgetDaily,
      platformSplit,
      winningCriteria,
      targeting,
      productInfo,
      startDate,
      endDate,
      autoApproveCreatives,
      autoScaleWinners,
      winnerScaleMultiplier,
    } = body;

    if (!companyId || !name || !totalBudgetDaily || !productInfo) {
      return NextResponse.json(
        { error: 'companyId, name, totalBudgetDaily, and productInfo are required' },
        { status: 400 }
      );
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

    const config: CreateCampaignConfig = {
      name,
      totalBudgetDaily,
      platformSplit,
      winningCriteria,
      targeting,
      productInfo,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      autoApproveCreatives,
      autoScaleWinners,
      winnerScaleMultiplier,
    };

    const campaign = await createTestCampaign(companyId, config, supabase);

    return NextResponse.json({ campaign });
  } catch (error) {
    console.error('Failed to create campaign:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create campaign' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ads/testing
 * List campaigns for a company
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('companyId');
  const status = searchParams.get('status');
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  if (!companyId) {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 });
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

  try {
    const { campaigns, total } = await getCampaigns(companyId, supabase, {
      status: status || undefined,
      limit,
      offset,
    });

    return NextResponse.json({
      campaigns,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + campaigns.length < total,
      },
    });
  } catch (error) {
    console.error('Failed to list campaigns:', error);
    return NextResponse.json(
      { error: 'Failed to list campaigns' },
      { status: 500 }
    );
  }
}

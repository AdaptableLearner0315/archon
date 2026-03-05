/**
 * Ad Testing Cron Job
 * Runs every 4 hours to collect performance and detect winners
 *
 * Vercel Cron: 0 * /4 * * *
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { collectAllPerformance } from '@/lib/agents/ads/testing/performance-collector';
import { detectAndProcessWinner } from '@/lib/agents/ads/testing/winner-detector';

// Create service role client for cron jobs
function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * GET /api/ads/testing/cron
 * Called by Vercel Cron every 4 hours
 */
export async function GET(request: NextRequest) {
  // Verify cron secret (optional but recommended)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const results: {
    performance: {
      campaignsProcessed: number;
      publicationsProcessed: number;
      snapshotsCreated: number;
      errors: string[];
    } | null;
    winners: {
      campaignsAnalyzed: number;
      winnersFound: number;
      details: { campaignId: string; winnerFound: boolean; message: string }[];
    };
  } = {
    performance: null,
    winners: {
      campaignsAnalyzed: 0,
      winnersFound: 0,
      details: [],
    },
  };

  try {
    const supabase = createServiceClient();

    // Step 1: Collect performance data from all active campaigns
    console.log('[Ad Testing Cron] Starting performance collection...');
    results.performance = await collectAllPerformance(supabase);
    console.log(`[Ad Testing Cron] Performance collection complete:`, results.performance);

    // Step 2: Analyze each active campaign for winners
    console.log('[Ad Testing Cron] Starting winner detection...');
    const { data: activeCampaigns } = await supabase
      .from('ad_test_campaigns')
      .select('id')
      .eq('status', 'active');

    if (activeCampaigns && activeCampaigns.length > 0) {
      for (const campaign of activeCampaigns) {
        try {
          const winnerResult = await detectAndProcessWinner(campaign.id, supabase);
          results.winners.campaignsAnalyzed++;

          if (winnerResult.winnerFound) {
            results.winners.winnersFound++;
          }

          results.winners.details.push({
            campaignId: campaign.id,
            winnerFound: winnerResult.winnerFound,
            message: winnerResult.message,
          });
        } catch (error) {
          results.winners.details.push({
            campaignId: campaign.id,
            winnerFound: false,
            message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[Ad Testing Cron] Complete in ${duration}ms:`, results);

    return NextResponse.json({
      success: true,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (error) {
    console.error('[Ad Testing Cron] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: `${Date.now() - startTime}ms`,
        results,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ads/testing/cron
 * Manual trigger for testing (requires authentication)
 */
export async function POST(request: NextRequest) {
  // For manual triggers, verify user authentication
  const { createClient: createUserClient } = await import('@/lib/supabase/server');
  const userSupabase = await createUserClient();
  const { data: { user } } = await userSupabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if user is admin (optional - you might want to restrict manual triggers)
  const body = await request.json().catch(() => ({}));
  const { campaignId } = body;

  const startTime = Date.now();

  try {
    const supabase = createServiceClient();

    // If campaignId provided, only process that campaign
    if (campaignId) {
      // Verify user owns this campaign
      const { data: campaign } = await supabase
        .from('ad_test_campaigns')
        .select('*, companies!inner(user_id)')
        .eq('id', campaignId)
        .single();

      if (!campaign || (campaign as { companies: { user_id: string } }).companies.user_id !== user.id) {
        return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
      }

      // Collect performance for this campaign only
      const { collectCampaignPerformance } = await import('@/lib/agents/ads/testing/performance-collector');
      const perfResult = await collectCampaignPerformance(campaignId, supabase);

      // Analyze for winner
      const winnerResult = await detectAndProcessWinner(campaignId, supabase);

      return NextResponse.json({
        success: true,
        duration: `${Date.now() - startTime}ms`,
        campaignId,
        performance: perfResult,
        winner: winnerResult,
      });
    }

    // Otherwise, run full cron
    const results = {
      performance: await collectAllPerformance(supabase),
      winners: {
        campaignsAnalyzed: 0,
        winnersFound: 0,
        details: [] as { campaignId: string; winnerFound: boolean; message: string }[],
      },
    };

    // Get all active campaigns owned by this user
    const { data: activeCampaigns } = await supabase
      .from('ad_test_campaigns')
      .select('id, companies!inner(user_id)')
      .eq('status', 'active')
      .eq('companies.user_id', user.id);

    if (activeCampaigns) {
      for (const campaign of activeCampaigns) {
        const winnerResult = await detectAndProcessWinner(campaign.id, supabase);
        results.winners.campaignsAnalyzed++;
        if (winnerResult.winnerFound) {
          results.winners.winnersFound++;
        }
        results.winners.details.push({
          campaignId: campaign.id,
          winnerFound: winnerResult.winnerFound,
          message: winnerResult.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      duration: `${Date.now() - startTime}ms`,
      results,
    });
  } catch (error) {
    console.error('[Ad Testing Cron Manual] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

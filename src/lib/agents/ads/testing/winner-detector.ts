/**
 * Winner Detector
 * Analyzes performance data to identify winning ad creatives
 * with statistical significance
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type AdTestCampaign,
  type AdTestWinner,
  type WinningCriteria,
  type AggregatedPerformance,
  type WinnerAnalysisResult,
  type AdPublicationRow,
  type AdTestWinnerRow,
  type PerformanceSnapshotRow,
  mapWinnerRowToModel,
} from './types';
import { getCampaign } from './campaign-manager';
import { scalePublicationBudget, pausePublication } from './publisher';
import { notifyWinnerFound } from './notifications';

/**
 * Calculate the runtime hours for a publication
 */
function calculateRuntimeHours(publishedAt: string | null): number {
  if (!publishedAt) return 0;
  const published = new Date(publishedAt);
  const now = new Date();
  return (now.getTime() - published.getTime()) / (1000 * 60 * 60);
}

/**
 * Calculate chi-squared test for statistical significance
 * Simplified two-proportion z-test for comparing conversion rates
 */
export function calculateStatisticalSignificance(
  control: { clicks: number; conversions: number },
  variant: { clicks: number; conversions: number }
): number {
  const n1 = control.clicks;
  const n2 = variant.clicks;
  const x1 = control.conversions;
  const x2 = variant.conversions;

  if (n1 === 0 || n2 === 0) return 1; // No significance if no data

  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const pPooled = (x1 + x2) / (n1 + n2);

  if (pPooled === 0 || pPooled === 1) return 1;

  const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / n1 + 1 / n2));
  if (se === 0) return 1;

  const z = Math.abs(p1 - p2) / se;

  // Convert z-score to p-value (two-tailed)
  // Using approximation: p ≈ 2 * (1 - Φ(|z|))
  const pValue = 2 * (1 - normalCDF(z));

  return pValue;
}

/**
 * Standard normal CDF approximation
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Get aggregated performance for all publications in a campaign
 */
async function getAggregatedCampaignPerformance(
  campaignId: string,
  supabase: SupabaseClient
): Promise<AggregatedPerformance[]> {
  // Get all active publications with their snapshots
  const { data: publications, error: pubError } = await supabase
    .from('ad_publications')
    .select('*')
    .eq('campaign_id', campaignId)
    .in('status', ['active', 'paused']);

  if (pubError) {
    throw new Error(`Failed to fetch publications: ${pubError.message}`);
  }

  if (!publications || publications.length === 0) {
    return [];
  }

  const aggregated: AggregatedPerformance[] = [];

  for (const pub of publications as AdPublicationRow[]) {
    // Get all snapshots for this publication
    const { data: snapshots } = await supabase
      .from('ad_performance_snapshots')
      .select('*')
      .eq('publication_id', pub.id);

    if (!snapshots || snapshots.length === 0) continue;

    const snapshotData = snapshots as PerformanceSnapshotRow[];

    // Sum up metrics
    const totals = snapshotData.reduce(
      (acc, s) => ({
        impressions: acc.impressions + s.impressions,
        clicks: acc.clicks + s.clicks,
        spendCents: acc.spendCents + s.spend_cents,
        conversions: acc.conversions + s.conversions,
        revenueCents: acc.revenueCents + s.revenue_cents,
      }),
      { impressions: 0, clicks: 0, spendCents: 0, conversions: 0, revenueCents: 0 }
    );

    const runtimeHours = calculateRuntimeHours(pub.published_at);
    const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
    const cpa = totals.conversions > 0 ? totals.spendCents / 100 / totals.conversions : Infinity;
    const roas = totals.spendCents > 0 ? totals.revenueCents / totals.spendCents : 0;

    aggregated.push({
      publicationId: pub.id,
      creativeId: pub.creative_id,
      platform: pub.platform,
      totalImpressions: totals.impressions,
      totalClicks: totals.clicks,
      totalSpendCents: totals.spendCents,
      totalConversions: totals.conversions,
      totalRevenueCents: totals.revenueCents,
      ctr,
      cpa,
      roas,
      runtimeHours,
      snapshotCount: snapshotData.length,
    });
  }

  return aggregated;
}

/**
 * Check if a performance meets the winning criteria
 */
function meetsWinningCriteria(
  perf: AggregatedPerformance,
  criteria: WinningCriteria
): boolean {
  return (
    perf.totalImpressions >= criteria.min_impressions &&
    perf.runtimeHours >= criteria.min_runtime_hours &&
    perf.ctr >= criteria.min_ctr &&
    (perf.cpa <= criteria.max_cpa || perf.cpa === Infinity) &&
    (perf.roas >= criteria.min_roas || perf.totalConversions === 0)
  );
}

/**
 * Analyze campaign performance and detect winners
 */
export async function analyzePerformance(
  campaignId: string,
  supabase: SupabaseClient
): Promise<WinnerAnalysisResult> {
  const campaign = await getCampaign(campaignId, supabase);
  if (!campaign) {
    return {
      hasWinner: false,
      winner: null,
      allPerformance: [],
      statisticalSignificance: 1,
      message: 'Campaign not found',
    };
  }

  const performances = await getAggregatedCampaignPerformance(campaignId, supabase);

  if (performances.length === 0) {
    return {
      hasWinner: false,
      winner: null,
      allPerformance: [],
      statisticalSignificance: 1,
      message: 'No performance data yet',
    };
  }

  // Filter by minimum requirements
  const eligiblePerformances = performances.filter(
    (p) =>
      p.totalImpressions >= campaign.winningCriteria.min_impressions &&
      p.runtimeHours >= campaign.winningCriteria.min_runtime_hours
  );

  if (eligiblePerformances.length === 0) {
    return {
      hasWinner: false,
      winner: null,
      allPerformance: performances,
      statisticalSignificance: 1,
      message: `Not enough data yet. Need ${campaign.winningCriteria.min_impressions} impressions and ${campaign.winningCriteria.min_runtime_hours}h runtime.`,
    };
  }

  // Sort by a composite score: CTR * ROAS / CPA (higher is better)
  const scored = eligiblePerformances.map((p) => ({
    ...p,
    score: p.ctr * Math.max(p.roas, 0.1) / Math.max(p.cpa, 0.01),
  }));
  scored.sort((a, b) => b.score - a.score);

  const potentialWinner = scored[0];

  // Check if winner meets all criteria
  if (!meetsWinningCriteria(potentialWinner, campaign.winningCriteria)) {
    return {
      hasWinner: false,
      winner: null,
      allPerformance: performances,
      statisticalSignificance: 1,
      message: 'Top performer does not meet winning criteria yet',
    };
  }

  // If only one eligible performer, can't calculate significance
  if (eligiblePerformances.length === 1) {
    return {
      hasWinner: true,
      winner: potentialWinner,
      allPerformance: performances,
      statisticalSignificance: 0.5, // Moderate confidence
      message: 'Winner found but no comparison available',
    };
  }

  // Calculate statistical significance against the runner-up
  const runnerUp = scored[1];
  const pValue = calculateStatisticalSignificance(
    { clicks: runnerUp.totalClicks, conversions: runnerUp.totalConversions },
    { clicks: potentialWinner.totalClicks, conversions: potentialWinner.totalConversions }
  );

  if (pValue > 0.05) {
    return {
      hasWinner: false,
      winner: null,
      allPerformance: performances,
      statisticalSignificance: pValue,
      message: `Results not statistically significant yet (p=${pValue.toFixed(3)})`,
    };
  }

  return {
    hasWinner: true,
    winner: potentialWinner,
    allPerformance: performances,
    statisticalSignificance: pValue,
    message: `Winner found with p-value ${pValue.toFixed(4)}`,
  };
}

/**
 * Declare a winner and record it in the database
 */
export async function declareWinner(
  campaignId: string,
  winner: AggregatedPerformance,
  statisticalSignificance: number,
  comparisonGroupSize: number,
  supabase: SupabaseClient
): Promise<AdTestWinner> {
  // Get current budget from publication
  const { data: pubData } = await supabase
    .from('ad_publications')
    .select('daily_budget_cents')
    .eq('id', winner.publicationId)
    .single();

  const currentBudget = pubData?.daily_budget_cents || 0;

  const { data, error } = await supabase
    .from('ad_test_winners')
    .insert({
      campaign_id: campaignId,
      publication_id: winner.publicationId,
      creative_id: winner.creativeId,
      winning_metrics: {
        ctr: winner.ctr,
        cpa: winner.cpa === Infinity ? 0 : winner.cpa,
        roas: winner.roas,
        impressions: winner.totalImpressions,
        clicks: winner.totalClicks,
        conversions: winner.totalConversions,
        spend: winner.totalSpendCents / 100,
        revenue: winner.totalRevenueCents / 100,
      },
      statistical_significance: statisticalSignificance,
      comparison_group_size: comparisonGroupSize,
      budget_before_scaling: currentBudget,
      budget_after_scaling: currentBudget, // Will be updated after scaling
      notified: false,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to declare winner: ${error.message}`);
  }

  return mapWinnerRowToModel(data as AdTestWinnerRow);
}

/**
 * Scale the winner's budget and pause losers
 */
export async function scaleWinnerAndPauseLosers(
  campaign: AdTestCampaign,
  winner: AdTestWinner,
  allPerformance: AggregatedPerformance[],
  supabase: SupabaseClient
): Promise<{
  scaled: boolean;
  newBudgetCents?: number;
  pausedCount: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let pausedCount = 0;
  let scaled = false;
  let newBudgetCents: number | undefined;

  // Scale winner budget if auto-scale is enabled
  if (campaign.autoScaleWinners) {
    const scaleResult = await scalePublicationBudget(
      winner.publicationId,
      campaign.winnerScaleMultiplier,
      supabase
    );

    if (scaleResult.success) {
      scaled = true;
      newBudgetCents = scaleResult.newBudgetCents;

      // Update winner record with new budget
      await supabase
        .from('ad_test_winners')
        .update({ budget_after_scaling: newBudgetCents })
        .eq('id', winner.id);
    } else {
      errors.push(`Failed to scale winner: ${scaleResult.message}`);
    }
  }

  // Pause losing publications
  for (const perf of allPerformance) {
    if (perf.publicationId === winner.publicationId) continue;

    const pauseResult = await pausePublication(perf.publicationId, supabase);
    if (pauseResult.success) {
      pausedCount++;
    } else {
      errors.push(`Failed to pause ${perf.publicationId}: ${pauseResult.message}`);
    }
  }

  return { scaled, newBudgetCents, pausedCount, errors };
}

/**
 * Full winner detection flow:
 * 1. Analyze performance
 * 2. If winner found, declare it
 * 3. Scale winner and pause losers
 * 4. Send notifications
 */
export async function detectAndProcessWinner(
  campaignId: string,
  supabase: SupabaseClient
): Promise<{
  winnerFound: boolean;
  winner?: AdTestWinner;
  message: string;
  actions: string[];
}> {
  const actions: string[] = [];

  // Check if winner already declared for this campaign
  const { data: existingWinner } = await supabase
    .from('ad_test_winners')
    .select('id')
    .eq('campaign_id', campaignId)
    .limit(1);

  if (existingWinner && existingWinner.length > 0) {
    return {
      winnerFound: false,
      message: 'Winner already declared for this campaign',
      actions: [],
    };
  }

  // Analyze performance
  const analysis = await analyzePerformance(campaignId, supabase);

  if (!analysis.hasWinner || !analysis.winner) {
    return {
      winnerFound: false,
      message: analysis.message,
      actions: [],
    };
  }

  // Declare winner
  const winner = await declareWinner(
    campaignId,
    analysis.winner,
    analysis.statisticalSignificance,
    analysis.allPerformance.length - 1,
    supabase
  );
  actions.push(`Declared winner: ${winner.creativeId}`);

  // Get campaign for settings
  const campaign = await getCampaign(campaignId, supabase);
  if (!campaign) {
    return {
      winnerFound: true,
      winner,
      message: 'Winner declared but campaign not found for scaling',
      actions,
    };
  }

  // Scale winner and pause losers
  const scaleResult = await scaleWinnerAndPauseLosers(
    campaign,
    winner,
    analysis.allPerformance,
    supabase
  );

  if (scaleResult.scaled) {
    actions.push(`Scaled winner budget to $${((scaleResult.newBudgetCents || 0) / 100).toFixed(2)}/day`);
  }
  if (scaleResult.pausedCount > 0) {
    actions.push(`Paused ${scaleResult.pausedCount} losing variants`);
  }
  actions.push(...scaleResult.errors);

  // Send notifications
  try {
    await notifyWinnerFound(winner, supabase);
    actions.push('Notification sent');
  } catch (err) {
    actions.push(`Notification failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  return {
    winnerFound: true,
    winner,
    message: analysis.message,
    actions,
  };
}

/**
 * Get all winners for a company
 */
export async function getCompanyWinners(
  companyId: string,
  supabase: SupabaseClient,
  options: { limit?: number } = {}
): Promise<AdTestWinner[]> {
  const { limit = 20 } = options;

  const { data, error } = await supabase
    .from('ad_test_winners')
    .select('*, ad_test_campaigns!inner(company_id)')
    .eq('ad_test_campaigns.company_id', companyId)
    .order('declared_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch winners: ${error.message}`);
  }

  return (data as AdTestWinnerRow[]).map(mapWinnerRowToModel);
}

/**
 * Get winner for a specific campaign
 */
export async function getCampaignWinner(
  campaignId: string,
  supabase: SupabaseClient
): Promise<AdTestWinner | null> {
  const { data, error } = await supabase
    .from('ad_test_winners')
    .select('*')
    .eq('campaign_id', campaignId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to fetch winner: ${error.message}`);
  }

  return mapWinnerRowToModel(data as AdTestWinnerRow);
}

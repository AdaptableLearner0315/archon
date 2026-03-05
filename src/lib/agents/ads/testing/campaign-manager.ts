/**
 * Campaign Manager
 * Handles the lifecycle of ad test campaigns including budget allocation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type AdTestCampaign,
  type AdTestCampaignRow,
  type PlatformSplit,
  type WinningCriteria,
  type Targeting,
  type ProductInfo,
  type BudgetAllocation,
  type AdCreative,
  type AdCreativeRow,
  mapCampaignRowToModel,
  mapCreativeRowToModel,
} from './types';

export interface CreateCampaignConfig {
  name: string;
  totalBudgetDaily: number;
  platformSplit?: PlatformSplit;
  winningCriteria?: Partial<WinningCriteria>;
  targeting?: Targeting;
  productInfo: ProductInfo;
  startDate?: Date;
  endDate?: Date;
  autoApproveCreatives?: boolean;
  autoScaleWinners?: boolean;
  winnerScaleMultiplier?: number;
}

const DEFAULT_WINNING_CRITERIA: WinningCriteria = {
  min_ctr: 1.5,
  max_cpa: 50,
  min_roas: 2.0,
  min_impressions: 1000,
  min_runtime_hours: 48,
};

const DEFAULT_PLATFORM_SPLIT: PlatformSplit = {
  tiktok: 50,
  meta: 50,
};

/**
 * Create a new ad test campaign
 */
export async function createTestCampaign(
  companyId: string,
  config: CreateCampaignConfig,
  supabase: SupabaseClient
): Promise<AdTestCampaign> {
  const winningCriteria: WinningCriteria = {
    ...DEFAULT_WINNING_CRITERIA,
    ...config.winningCriteria,
  };

  const platformSplit = config.platformSplit || DEFAULT_PLATFORM_SPLIT;

  const { data, error } = await supabase
    .from('ad_test_campaigns')
    .insert({
      company_id: companyId,
      name: config.name,
      status: 'draft',
      total_budget_daily: config.totalBudgetDaily,
      platform_split: platformSplit,
      winning_criteria: winningCriteria,
      targeting: config.targeting || null,
      product_info: config.productInfo,
      start_date: config.startDate?.toISOString() || null,
      end_date: config.endDate?.toISOString() || null,
      auto_approve_creatives: config.autoApproveCreatives ?? false,
      auto_scale_winners: config.autoScaleWinners ?? true,
      winner_scale_multiplier: config.winnerScaleMultiplier ?? 2.0,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create campaign: ${error.message}`);
  }

  return mapCampaignRowToModel(data as AdTestCampaignRow);
}

/**
 * Get a campaign by ID
 */
export async function getCampaign(
  campaignId: string,
  supabase: SupabaseClient
): Promise<AdTestCampaign | null> {
  const { data, error } = await supabase
    .from('ad_test_campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to fetch campaign: ${error.message}`);
  }

  return mapCampaignRowToModel(data as AdTestCampaignRow);
}

/**
 * Get all campaigns for a company
 */
export async function getCampaigns(
  companyId: string,
  supabase: SupabaseClient,
  options: { status?: string; limit?: number; offset?: number } = {}
): Promise<{ campaigns: AdTestCampaign[]; total: number }> {
  const { status, limit = 20, offset = 0 } = options;

  let query = supabase
    .from('ad_test_campaigns')
    .select('*', { count: 'exact' })
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to fetch campaigns: ${error.message}`);
  }

  return {
    campaigns: (data as AdTestCampaignRow[]).map(mapCampaignRowToModel),
    total: count || 0,
  };
}

/**
 * Update campaign status
 */
export async function updateCampaignStatus(
  campaignId: string,
  status: AdTestCampaign['status'],
  supabase: SupabaseClient
): Promise<void> {
  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === 'active') {
    updates.start_date = new Date().toISOString();
  } else if (status === 'completed' || status === 'paused') {
    updates.end_date = new Date().toISOString();
  }

  const { error } = await supabase
    .from('ad_test_campaigns')
    .update(updates)
    .eq('id', campaignId);

  if (error) {
    throw new Error(`Failed to update campaign status: ${error.message}`);
  }
}

/**
 * Update campaign configuration
 */
export async function updateCampaign(
  campaignId: string,
  updates: Partial<{
    name: string;
    totalBudgetDaily: number;
    platformSplit: PlatformSplit;
    winningCriteria: WinningCriteria;
    targeting: Targeting;
    autoApproveCreatives: boolean;
    autoScaleWinners: boolean;
    winnerScaleMultiplier: number;
  }>,
  supabase: SupabaseClient
): Promise<AdTestCampaign> {
  const dbUpdates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.totalBudgetDaily !== undefined) dbUpdates.total_budget_daily = updates.totalBudgetDaily;
  if (updates.platformSplit !== undefined) dbUpdates.platform_split = updates.platformSplit;
  if (updates.winningCriteria !== undefined) dbUpdates.winning_criteria = updates.winningCriteria;
  if (updates.targeting !== undefined) dbUpdates.targeting = updates.targeting;
  if (updates.autoApproveCreatives !== undefined) dbUpdates.auto_approve_creatives = updates.autoApproveCreatives;
  if (updates.autoScaleWinners !== undefined) dbUpdates.auto_scale_winners = updates.autoScaleWinners;
  if (updates.winnerScaleMultiplier !== undefined) dbUpdates.winner_scale_multiplier = updates.winnerScaleMultiplier;

  const { data, error } = await supabase
    .from('ad_test_campaigns')
    .update(dbUpdates)
    .eq('id', campaignId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update campaign: ${error.message}`);
  }

  return mapCampaignRowToModel(data as AdTestCampaignRow);
}

/**
 * Delete a campaign (only if draft or failed)
 */
export async function deleteCampaign(
  campaignId: string,
  supabase: SupabaseClient
): Promise<void> {
  const campaign = await getCampaign(campaignId, supabase);

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  if (!['draft', 'failed'].includes(campaign.status)) {
    throw new Error('Can only delete draft or failed campaigns');
  }

  const { error } = await supabase
    .from('ad_test_campaigns')
    .delete()
    .eq('id', campaignId);

  if (error) {
    throw new Error(`Failed to delete campaign: ${error.message}`);
  }
}

/**
 * Calculate budget allocation for approved creatives across platforms
 */
export async function calculateBudgetAllocation(
  campaignId: string,
  supabase: SupabaseClient
): Promise<BudgetAllocation[]> {
  const campaign = await getCampaign(campaignId, supabase);
  if (!campaign) {
    throw new Error('Campaign not found');
  }

  // Get approved creatives
  const { data: creatives, error } = await supabase
    .from('ad_creatives')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('status', 'approved');

  if (error) {
    throw new Error(`Failed to fetch creatives: ${error.message}`);
  }

  if (!creatives || creatives.length === 0) {
    throw new Error('No approved creatives to allocate budget');
  }

  const totalBudgetCents = Math.round(campaign.totalBudgetDaily * 100);
  const tiktokBudgetCents = Math.round(totalBudgetCents * (campaign.platformSplit.tiktok / 100));
  const metaBudgetCents = totalBudgetCents - tiktokBudgetCents;

  // Split creatives evenly across platforms
  const creativeCount = creatives.length;
  const budgetPerCreativeTikTok = Math.floor(tiktokBudgetCents / creativeCount);
  const budgetPerCreativeMeta = Math.floor(metaBudgetCents / creativeCount);

  const allocations: BudgetAllocation[] = [];

  for (const creative of creatives as AdCreativeRow[]) {
    // TikTok allocation
    if (campaign.platformSplit.tiktok > 0) {
      allocations.push({
        platform: 'tiktok',
        creativeId: creative.id,
        budgetCents: budgetPerCreativeTikTok,
      });
    }

    // Meta allocation
    if (campaign.platformSplit.meta > 0) {
      allocations.push({
        platform: 'meta',
        creativeId: creative.id,
        budgetCents: budgetPerCreativeMeta,
      });
    }
  }

  return allocations;
}

/**
 * Get approved creatives for a campaign
 */
export async function getApprovedCreatives(
  campaignId: string,
  supabase: SupabaseClient
): Promise<AdCreative[]> {
  const { data, error } = await supabase
    .from('ad_creatives')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('status', 'approved')
    .order('concept_id')
    .order('variation_number');

  if (error) {
    throw new Error(`Failed to fetch approved creatives: ${error.message}`);
  }

  return (data as AdCreativeRow[]).map(mapCreativeRowToModel);
}

/**
 * Start a campaign - validates requirements and updates status
 */
export async function startCampaign(
  campaignId: string,
  supabase: SupabaseClient
): Promise<{ success: boolean; message: string }> {
  const campaign = await getCampaign(campaignId, supabase);

  if (!campaign) {
    return { success: false, message: 'Campaign not found' };
  }

  if (campaign.status !== 'draft') {
    return { success: false, message: `Campaign is ${campaign.status}, must be draft to start` };
  }

  // Check for approved creatives
  const approvedCreatives = await getApprovedCreatives(campaignId, supabase);

  if (approvedCreatives.length === 0) {
    return { success: false, message: 'No approved creatives. Generate and approve creatives first.' };
  }

  // Update status to active
  await updateCampaignStatus(campaignId, 'active', supabase);

  return {
    success: true,
    message: `Campaign started with ${approvedCreatives.length} creatives`,
  };
}

/**
 * Pause a running campaign
 */
export async function pauseCampaign(
  campaignId: string,
  supabase: SupabaseClient
): Promise<void> {
  const campaign = await getCampaign(campaignId, supabase);

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  if (campaign.status !== 'active') {
    throw new Error('Can only pause active campaigns');
  }

  await updateCampaignStatus(campaignId, 'paused', supabase);
}

/**
 * Resume a paused campaign
 */
export async function resumeCampaign(
  campaignId: string,
  supabase: SupabaseClient
): Promise<void> {
  const campaign = await getCampaign(campaignId, supabase);

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  if (campaign.status !== 'paused') {
    throw new Error('Can only resume paused campaigns');
  }

  await updateCampaignStatus(campaignId, 'active', supabase);
}

/**
 * Complete a campaign
 */
export async function completeCampaign(
  campaignId: string,
  supabase: SupabaseClient
): Promise<void> {
  const campaign = await getCampaign(campaignId, supabase);

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  if (!['active', 'paused'].includes(campaign.status)) {
    throw new Error('Can only complete active or paused campaigns');
  }

  await updateCampaignStatus(campaignId, 'completed', supabase);
}

/**
 * Mark campaign as failed
 */
export async function failCampaign(
  campaignId: string,
  reason: string,
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase
    .from('ad_test_campaigns')
    .update({
      status: 'failed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', campaignId);

  if (error) {
    throw new Error(`Failed to update campaign: ${error.message}`);
  }

  console.error(`Campaign ${campaignId} failed: ${reason}`);
}

/**
 * Get campaign summary with stats
 */
export async function getCampaignSummary(
  campaignId: string,
  supabase: SupabaseClient
): Promise<{
  campaign: AdTestCampaign;
  creativesCount: { total: number; pending: number; approved: number; published: number };
  publicationsCount: { total: number; active: number; paused: number; failed: number };
  hasWinner: boolean;
} | null> {
  const campaign = await getCampaign(campaignId, supabase);
  if (!campaign) return null;

  const [creativesResult, publicationsResult, winnersResult] = await Promise.all([
    supabase
      .from('ad_creatives')
      .select('status')
      .eq('campaign_id', campaignId),
    supabase
      .from('ad_publications')
      .select('status')
      .eq('campaign_id', campaignId),
    supabase
      .from('ad_test_winners')
      .select('id')
      .eq('campaign_id', campaignId)
      .limit(1),
  ]);

  const creatives = creativesResult.data || [];
  const publications = publicationsResult.data || [];

  return {
    campaign,
    creativesCount: {
      total: creatives.length,
      pending: creatives.filter((c) => c.status === 'pending').length,
      approved: creatives.filter((c) => c.status === 'approved').length,
      published: creatives.filter((c) => c.status === 'published').length,
    },
    publicationsCount: {
      total: publications.length,
      active: publications.filter((p) => p.status === 'active').length,
      paused: publications.filter((p) => p.status === 'paused').length,
      failed: publications.filter((p) => p.status === 'failed').length,
    },
    hasWinner: (winnersResult.data?.length || 0) > 0,
  };
}

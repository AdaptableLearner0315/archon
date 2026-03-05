/**
 * Performance Collector
 * Collects performance data from ad platforms and stores snapshots
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type AdPublication,
  type PerformanceSnapshot,
  type AdPublicationRow,
  type PerformanceSnapshotRow,
  mapPublicationRowToModel,
  mapSnapshotRowToModel,
} from './types';
import { decryptCredentials } from '../credentials';
import { createMetaAdsClient } from '../platforms/meta';
import { createTikTokAdsClient, type TikTokAdStats } from '../platforms/tiktok-ads';
import type { MetaAdStats } from '../platforms/meta';

interface CollectionResult {
  publicationId: string;
  success: boolean;
  snapshot?: PerformanceSnapshot;
  error?: string;
}

/**
 * Get date range for performance query (last 24 hours)
 */
function getDateRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  return {
    startDate: yesterday.toISOString().split('T')[0],
    endDate: now.toISOString().split('T')[0],
  };
}

/**
 * Collect performance from TikTok for a publication
 */
async function collectFromTikTok(
  publication: AdPublication,
  credentials: Record<string, string>
): Promise<TikTokAdStats | null> {
  if (!publication.externalCampaignId) {
    return null;
  }

  const client = createTikTokAdsClient(credentials as { accessToken: string; advertiserId: string });
  const dateRange = getDateRange();

  try {
    return await client.getCampaignStats(publication.externalCampaignId, dateRange);
  } catch (error) {
    console.error(`Failed to collect TikTok stats for ${publication.id}:`, error);
    return null;
  }
}

/**
 * Collect performance from Meta for a publication
 */
async function collectFromMeta(
  publication: AdPublication,
  credentials: Record<string, string>
): Promise<MetaAdStats | null> {
  if (!publication.externalCampaignId) {
    return null;
  }

  const client = createMetaAdsClient(credentials as { accessToken: string; adAccountId: string });
  const dateRange = getDateRange();

  try {
    return await client.getCampaignStats(publication.externalCampaignId, dateRange);
  } catch (error) {
    console.error(`Failed to collect Meta stats for ${publication.id}:`, error);
    return null;
  }
}

/**
 * Save a performance snapshot to the database
 */
async function saveSnapshot(
  publicationId: string,
  stats: {
    impressions: number;
    clicks: number;
    spendCents: number;
    conversions: number;
    revenueCents: number;
    reach?: number;
    videoViews?: number;
    videoViewsP25?: number;
    videoViewsP50?: number;
    videoViewsP75?: number;
    videoViewsP100?: number;
  },
  supabase: SupabaseClient
): Promise<PerformanceSnapshot> {
  const { data, error } = await supabase
    .from('ad_performance_snapshots')
    .insert({
      publication_id: publicationId,
      impressions: stats.impressions,
      clicks: stats.clicks,
      spend_cents: stats.spendCents,
      conversions: stats.conversions,
      revenue_cents: stats.revenueCents,
      reach: stats.reach || 0,
      video_views: stats.videoViews || 0,
      video_views_p25: stats.videoViewsP25 || 0,
      video_views_p50: stats.videoViewsP50 || 0,
      video_views_p75: stats.videoViewsP75 || 0,
      video_views_p100: stats.videoViewsP100 || 0,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save snapshot: ${error.message}`);
  }

  return mapSnapshotRowToModel(data as PerformanceSnapshotRow);
}

/**
 * Collect performance for a single publication
 */
export async function collectPublicationPerformance(
  publicationId: string,
  supabase: SupabaseClient
): Promise<CollectionResult> {
  // Get publication with campaign info
  const { data: pubData } = await supabase
    .from('ad_publications')
    .select('*, ad_test_campaigns!inner(company_id)')
    .eq('id', publicationId)
    .single();

  if (!pubData) {
    return { publicationId, success: false, error: 'Publication not found' };
  }

  const publication = mapPublicationRowToModel(pubData as AdPublicationRow);
  const companyId = (pubData as { ad_test_campaigns: { company_id: string } }).ad_test_campaigns.company_id;

  // Get credentials
  const { data: credData } = await supabase
    .from('ad_platform_credentials')
    .select('credentials_encrypted')
    .eq('company_id', companyId)
    .eq('platform', publication.platform)
    .eq('is_active', true)
    .single();

  if (!credData) {
    return { publicationId, success: false, error: `No credentials for ${publication.platform}` };
  }

  const credentials = decryptCredentials(credData.credentials_encrypted) as Record<string, string>;

  try {
    let stats: {
      impressions: number;
      clicks: number;
      spendCents: number;
      conversions: number;
      revenueCents: number;
      reach?: number;
      videoViews?: number;
      videoViewsP25?: number;
      videoViewsP50?: number;
      videoViewsP75?: number;
      videoViewsP100?: number;
    } | null = null;

    if (publication.platform === 'tiktok') {
      const tiktokStats = await collectFromTikTok(publication, credentials);
      if (tiktokStats) {
        stats = {
          impressions: tiktokStats.impressions,
          clicks: tiktokStats.clicks,
          spendCents: Math.round(tiktokStats.spend * 100),
          conversions: tiktokStats.conversions,
          revenueCents: Math.round(tiktokStats.revenue * 100),
          reach: tiktokStats.reach,
          videoViews: tiktokStats.videoViews,
          videoViewsP25: tiktokStats.videoViewsP25,
          videoViewsP50: tiktokStats.videoViewsP50,
          videoViewsP75: tiktokStats.videoViewsP75,
          videoViewsP100: tiktokStats.videoViewsP100,
        };
      }
    } else if (publication.platform === 'meta') {
      const metaStats = await collectFromMeta(publication, credentials);
      if (metaStats) {
        // Convert Meta conversions from actions array
        const purchases = metaStats.actions.find(a => a.actionType === 'purchase')?.value || 0;
        const leads = metaStats.actions.find(a => a.actionType === 'lead')?.value || 0;

        stats = {
          impressions: metaStats.impressions,
          clicks: metaStats.clicks,
          spendCents: Math.round(metaStats.spend * 100),
          conversions: purchases + leads,
          revenueCents: 0, // Meta doesn't provide revenue directly
          reach: metaStats.reach,
        };
      }
    }

    if (!stats) {
      return { publicationId, success: false, error: 'No stats returned from platform' };
    }

    const snapshot = await saveSnapshot(publicationId, stats, supabase);

    return { publicationId, success: true, snapshot };
  } catch (error) {
    return {
      publicationId,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Collect performance for all active publications in a campaign
 */
export async function collectCampaignPerformance(
  campaignId: string,
  supabase: SupabaseClient
): Promise<{
  total: number;
  successful: number;
  failed: number;
  results: CollectionResult[];
}> {
  // Get all active publications for the campaign
  const { data: publications, error } = await supabase
    .from('ad_publications')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('status', 'active');

  if (error) {
    throw new Error(`Failed to fetch publications: ${error.message}`);
  }

  if (!publications || publications.length === 0) {
    return { total: 0, successful: 0, failed: 0, results: [] };
  }

  const results: CollectionResult[] = [];

  for (const pub of publications) {
    const result = await collectPublicationPerformance(pub.id, supabase);
    results.push(result);
  }

  return {
    total: results.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
  };
}

/**
 * Collect performance for all active campaigns across all companies
 * This is called by the cron job every 4 hours
 */
export async function collectAllPerformance(
  supabase: SupabaseClient
): Promise<{
  campaignsProcessed: number;
  publicationsProcessed: number;
  snapshotsCreated: number;
  errors: string[];
}> {
  // Get all active campaigns
  const { data: campaigns, error } = await supabase
    .from('ad_test_campaigns')
    .select('id')
    .eq('status', 'active');

  if (error) {
    throw new Error(`Failed to fetch active campaigns: ${error.message}`);
  }

  if (!campaigns || campaigns.length === 0) {
    return { campaignsProcessed: 0, publicationsProcessed: 0, snapshotsCreated: 0, errors: [] };
  }

  let publicationsProcessed = 0;
  let snapshotsCreated = 0;
  const errors: string[] = [];

  for (const campaign of campaigns) {
    try {
      const result = await collectCampaignPerformance(campaign.id, supabase);
      publicationsProcessed += result.total;
      snapshotsCreated += result.successful;

      for (const r of result.results) {
        if (!r.success && r.error) {
          errors.push(`${r.publicationId}: ${r.error}`);
        }
      }
    } catch (err) {
      errors.push(`Campaign ${campaign.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return {
    campaignsProcessed: campaigns.length,
    publicationsProcessed,
    snapshotsCreated,
    errors,
  };
}

/**
 * Get all snapshots for a publication
 */
export async function getPublicationSnapshots(
  publicationId: string,
  supabase: SupabaseClient,
  options: { limit?: number; since?: Date } = {}
): Promise<PerformanceSnapshot[]> {
  const { limit = 100, since } = options;

  let query = supabase
    .from('ad_performance_snapshots')
    .select('*')
    .eq('publication_id', publicationId)
    .order('snapshot_at', { ascending: false })
    .limit(limit);

  if (since) {
    query = query.gte('snapshot_at', since.toISOString());
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch snapshots: ${error.message}`);
  }

  return (data as PerformanceSnapshotRow[]).map(mapSnapshotRowToModel);
}

/**
 * Get latest snapshot for each publication in a campaign
 */
export async function getCampaignLatestSnapshots(
  campaignId: string,
  supabase: SupabaseClient
): Promise<Map<string, PerformanceSnapshot>> {
  // Get all publications for the campaign
  const { data: publications } = await supabase
    .from('ad_publications')
    .select('id')
    .eq('campaign_id', campaignId);

  if (!publications || publications.length === 0) {
    return new Map();
  }

  const latestSnapshots = new Map<string, PerformanceSnapshot>();

  // For each publication, get the latest snapshot
  for (const pub of publications) {
    const { data } = await supabase
      .from('ad_performance_snapshots')
      .select('*')
      .eq('publication_id', pub.id)
      .order('snapshot_at', { ascending: false })
      .limit(1)
      .single();

    if (data) {
      latestSnapshots.set(pub.id, mapSnapshotRowToModel(data as PerformanceSnapshotRow));
    }
  }

  return latestSnapshots;
}

/**
 * Get aggregated performance totals for a publication
 */
export async function getAggregatedPerformance(
  publicationId: string,
  supabase: SupabaseClient
): Promise<{
  totalImpressions: number;
  totalClicks: number;
  totalSpendCents: number;
  totalConversions: number;
  totalRevenueCents: number;
  ctr: number;
  cpa: number;
  roas: number;
} | null> {
  const snapshots = await getPublicationSnapshots(publicationId, supabase);

  if (snapshots.length === 0) {
    return null;
  }

  // Sum up all metrics from snapshots
  const totals = snapshots.reduce(
    (acc, s) => ({
      impressions: acc.impressions + s.impressions,
      clicks: acc.clicks + s.clicks,
      spendCents: acc.spendCents + s.spendCents,
      conversions: acc.conversions + s.conversions,
      revenueCents: acc.revenueCents + s.revenueCents,
    }),
    { impressions: 0, clicks: 0, spendCents: 0, conversions: 0, revenueCents: 0 }
  );

  const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const cpa = totals.conversions > 0 ? totals.spendCents / 100 / totals.conversions : 0;
  const roas = totals.spendCents > 0 ? totals.revenueCents / totals.spendCents : 0;

  return {
    totalImpressions: totals.impressions,
    totalClicks: totals.clicks,
    totalSpendCents: totals.spendCents,
    totalConversions: totals.conversions,
    totalRevenueCents: totals.revenueCents,
    ctr,
    cpa,
    roas,
  };
}

/**
 * Multi-Platform Ad Publisher
 * Publishes approved creatives to TikTok and Meta
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type AdTestCampaign,
  type AdCreative,
  type AdPublication,
  type BudgetAllocation,
  type AdPlatform,
  type AdPublicationRow,
  mapPublicationRowToModel,
} from './types';
import { getCampaign, calculateBudgetAllocation, getApprovedCreatives } from './campaign-manager';
import { decryptCredentials } from '../credentials';
import { createMetaAdsClient } from '../platforms/meta';
import { createTikTokAdsClient } from '../platforms/tiktok-ads';

interface PublishResult {
  success: boolean;
  publication?: AdPublication;
  error?: string;
}

interface PlatformCredentials {
  platform: AdPlatform;
  credentials: Record<string, string>;
}

/**
 * Get platform credentials for a company
 */
async function getPlatformCredentials(
  companyId: string,
  platform: AdPlatform,
  supabase: SupabaseClient
): Promise<Record<string, string> | null> {
  const { data } = await supabase
    .from('ad_platform_credentials')
    .select('credentials_encrypted')
    .eq('company_id', companyId)
    .eq('platform', platform)
    .eq('is_active', true)
    .single();

  if (!data) return null;

  const decrypted = decryptCredentials(data.credentials_encrypted);
  // Cast to string record since credentials are always strings
  return decrypted as Record<string, string>;
}

/**
 * Publish a creative to TikTok
 */
async function publishToTikTok(
  creative: AdCreative,
  campaign: AdTestCampaign,
  budgetCents: number,
  credentials: Record<string, string>,
  supabase: SupabaseClient
): Promise<PublishResult> {
  try {
    const client = createTikTokAdsClient(credentials as { accessToken: string; advertiserId: string });

    // Create campaign on TikTok
    const { campaignId: externalCampaignId } = await client.createCampaign({
      name: `${campaign.name} - ${creative.conceptId}-v${creative.variationNumber}`,
      objective: 'CONVERSIONS',
      budgetMode: 'BUDGET_MODE_DAY',
      budget: budgetCents / 100,
    });

    // Create ad group with targeting
    const targeting = campaign.targeting || {};
    const { adGroupId: externalAdsetId } = await client.createAdGroup(
      externalCampaignId,
      {
        name: `AdGroup - ${creative.conceptId}-v${creative.variationNumber}`,
        targeting: {
          ageRange: targeting.age_min && targeting.age_max
            ? { min: targeting.age_min, max: targeting.age_max }
            : undefined,
          gender: targeting.genders?.[0] === 'male' ? 'MALE' :
                  targeting.genders?.[0] === 'female' ? 'FEMALE' : 'UNLIMITED',
          locations: targeting.locations,
          interests: targeting.interests,
          behaviors: targeting.behaviors,
          customAudiences: targeting.custom_audiences,
          excludedAudiences: targeting.excluded_audiences,
        },
        budget: budgetCents / 100,
        budgetMode: 'BUDGET_MODE_DAY',
        bidPrice: 1.0, // Default bid, will be optimized by TikTok
        optimizationGoal: 'CONVERSION',
        placement: ['PLACEMENT_TIKTOK'],
      }
    );

    // For UGC scripts, we need to have the video uploaded separately
    // Here we create a placeholder - in production, video would be uploaded first
    // const { adId: externalAdId } = await client.createAd(externalAdsetId, {
    //   videoId: 'VIDEO_ID_HERE',
    //   displayName: creative.content.hook.slice(0, 40),
    //   callToAction: 'LEARN_MORE',
    //   landingPageUrl: 'https://example.com',
    // });

    // Create publication record
    const { data: publication, error } = await supabase
      .from('ad_publications')
      .insert({
        company_id: creative.companyId,
        campaign_id: campaign.id,
        creative_id: creative.id,
        platform: 'tiktok',
        external_campaign_id: externalCampaignId,
        external_adset_id: externalAdsetId,
        external_ad_id: null, // Will be set when video is uploaded
        daily_budget_cents: budgetCents,
        status: 'creating', // Video needs to be uploaded
        published_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save publication: ${error.message}`);
    }

    // Update creative status
    await supabase
      .from('ad_creatives')
      .update({ status: 'published', updated_at: new Date().toISOString() })
      .eq('id', creative.id);

    return {
      success: true,
      publication: mapPublicationRowToModel(publication as AdPublicationRow),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error publishing to TikTok',
    };
  }
}

/**
 * Publish a creative to Meta (Facebook/Instagram)
 */
async function publishToMeta(
  creative: AdCreative,
  campaign: AdTestCampaign,
  budgetCents: number,
  credentials: Record<string, string>,
  supabase: SupabaseClient
): Promise<PublishResult> {
  try {
    const client = createMetaAdsClient(credentials as { accessToken: string; adAccountId: string });

    // For Meta, we need to create the campaign, ad set, and ad
    // The existing MetaAdsClient only supports reading and budget updates
    // Here we'll create a publication record for tracking
    // In production, you'd extend the Meta client with create methods

    // Create publication record (in "creating" status until Meta API integration complete)
    const { data: publication, error } = await supabase
      .from('ad_publications')
      .insert({
        company_id: creative.companyId,
        campaign_id: campaign.id,
        creative_id: creative.id,
        platform: 'meta',
        external_campaign_id: null, // Will be set when created on Meta
        external_adset_id: null,
        external_ad_id: null,
        daily_budget_cents: budgetCents,
        status: 'creating',
        published_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save publication: ${error.message}`);
    }

    // Update creative status
    await supabase
      .from('ad_creatives')
      .update({ status: 'published', updated_at: new Date().toISOString() })
      .eq('id', creative.id);

    return {
      success: true,
      publication: mapPublicationRowToModel(publication as AdPublicationRow),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error publishing to Meta',
    };
  }
}

/**
 * Publish a single creative to a specific platform
 */
export async function publishCreative(
  creative: AdCreative,
  campaign: AdTestCampaign,
  platform: AdPlatform,
  budgetCents: number,
  supabase: SupabaseClient
): Promise<PublishResult> {
  const credentials = await getPlatformCredentials(campaign.companyId, platform, supabase);

  if (!credentials) {
    return {
      success: false,
      error: `No ${platform} credentials configured`,
    };
  }

  if (platform === 'tiktok') {
    return publishToTikTok(creative, campaign, budgetCents, credentials, supabase);
  } else if (platform === 'meta') {
    return publishToMeta(creative, campaign, budgetCents, credentials, supabase);
  }

  return {
    success: false,
    error: `Unsupported platform: ${platform}`,
  };
}

/**
 * Publish all approved creatives for a campaign to all configured platforms
 */
export async function publishAllCreatives(
  campaignId: string,
  supabase: SupabaseClient
): Promise<{
  total: number;
  successful: number;
  failed: number;
  publications: AdPublication[];
  errors: { creativeId: string; platform: string; error: string }[];
}> {
  const campaign = await getCampaign(campaignId, supabase);
  if (!campaign) {
    throw new Error('Campaign not found');
  }

  const allocations = await calculateBudgetAllocation(campaignId, supabase);
  const creatives = await getApprovedCreatives(campaignId, supabase);

  // Get credentials for both platforms
  const credentialsMap = new Map<AdPlatform, Record<string, string>>();

  for (const platform of ['tiktok', 'meta'] as AdPlatform[]) {
    const creds = await getPlatformCredentials(campaign.companyId, platform, supabase);
    if (creds) {
      credentialsMap.set(platform, creds);
    }
  }

  const publications: AdPublication[] = [];
  const errors: { creativeId: string; platform: string; error: string }[] = [];

  // Publish each allocation
  for (const allocation of allocations) {
    const creative = creatives.find((c) => c.id === allocation.creativeId);
    if (!creative) continue;

    const credentials = credentialsMap.get(allocation.platform);
    if (!credentials) {
      errors.push({
        creativeId: allocation.creativeId,
        platform: allocation.platform,
        error: `No credentials for ${allocation.platform}`,
      });
      continue;
    }

    const result = allocation.platform === 'tiktok'
      ? await publishToTikTok(creative, campaign, allocation.budgetCents, credentials, supabase)
      : await publishToMeta(creative, campaign, allocation.budgetCents, credentials, supabase);

    if (result.success && result.publication) {
      publications.push(result.publication);
    } else {
      errors.push({
        creativeId: allocation.creativeId,
        platform: allocation.platform,
        error: result.error || 'Unknown error',
      });
    }
  }

  return {
    total: allocations.length,
    successful: publications.length,
    failed: errors.length,
    publications,
    errors,
  };
}

/**
 * Get all publications for a campaign
 */
export async function getCampaignPublications(
  campaignId: string,
  supabase: SupabaseClient
): Promise<AdPublication[]> {
  const { data, error } = await supabase
    .from('ad_publications')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch publications: ${error.message}`);
  }

  return (data as AdPublicationRow[]).map(mapPublicationRowToModel);
}

/**
 * Update publication status
 */
export async function updatePublicationStatus(
  publicationId: string,
  status: AdPublication['status'],
  errorMessage?: string,
  supabase?: SupabaseClient
): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase client required');
  }

  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === 'paused') {
    updates.paused_at = new Date().toISOString();
  }

  if (errorMessage) {
    updates.error_message = errorMessage;
  }

  const { error } = await supabase
    .from('ad_publications')
    .update(updates)
    .eq('id', publicationId);

  if (error) {
    throw new Error(`Failed to update publication: ${error.message}`);
  }
}

/**
 * Pause a publication on its platform
 */
export async function pausePublication(
  publicationId: string,
  supabase: SupabaseClient
): Promise<{ success: boolean; message: string }> {
  const { data: publication } = await supabase
    .from('ad_publications')
    .select('*, ad_test_campaigns!inner(company_id)')
    .eq('id', publicationId)
    .single();

  if (!publication) {
    return { success: false, message: 'Publication not found' };
  }

  const pubData = publication as AdPublicationRow & { ad_test_campaigns: { company_id: string } };
  const companyId = pubData.ad_test_campaigns.company_id;
  const credentials = await getPlatformCredentials(companyId, pubData.platform, supabase);

  if (!credentials) {
    return { success: false, message: `No credentials for ${pubData.platform}` };
  }

  try {
    if (pubData.platform === 'tiktok' && pubData.external_campaign_id) {
      const client = createTikTokAdsClient(credentials as { accessToken: string; advertiserId: string });
      await client.pauseCampaign(pubData.external_campaign_id);
    } else if (pubData.platform === 'meta' && pubData.external_campaign_id) {
      const client = createMetaAdsClient(credentials as { accessToken: string; adAccountId: string });
      await client.pauseCampaign(pubData.external_campaign_id);
    }

    await updatePublicationStatus(publicationId, 'paused', undefined, supabase);
    return { success: true, message: 'Publication paused' };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Failed to pause' };
  }
}

/**
 * Activate a publication on its platform
 */
export async function activatePublication(
  publicationId: string,
  supabase: SupabaseClient
): Promise<{ success: boolean; message: string }> {
  const { data: publication } = await supabase
    .from('ad_publications')
    .select('*, ad_test_campaigns!inner(company_id)')
    .eq('id', publicationId)
    .single();

  if (!publication) {
    return { success: false, message: 'Publication not found' };
  }

  const pubData = publication as AdPublicationRow & { ad_test_campaigns: { company_id: string } };
  const companyId = pubData.ad_test_campaigns.company_id;
  const credentials = await getPlatformCredentials(companyId, pubData.platform, supabase);

  if (!credentials) {
    return { success: false, message: `No credentials for ${pubData.platform}` };
  }

  try {
    if (pubData.platform === 'tiktok' && pubData.external_campaign_id) {
      const client = createTikTokAdsClient(credentials as { accessToken: string; advertiserId: string });
      await client.activateCampaign(pubData.external_campaign_id);
    } else if (pubData.platform === 'meta' && pubData.external_campaign_id) {
      const client = createMetaAdsClient(credentials as { accessToken: string; adAccountId: string });
      await client.activateCampaign(pubData.external_campaign_id);
    }

    await updatePublicationStatus(publicationId, 'active', undefined, supabase);
    return { success: true, message: 'Publication activated' };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Failed to activate' };
  }
}

/**
 * Scale a publication's budget
 */
export async function scalePublicationBudget(
  publicationId: string,
  multiplier: number,
  supabase: SupabaseClient
): Promise<{ success: boolean; message: string; newBudgetCents?: number }> {
  const { data: publication } = await supabase
    .from('ad_publications')
    .select('*, ad_test_campaigns!inner(company_id)')
    .eq('id', publicationId)
    .single();

  if (!publication) {
    return { success: false, message: 'Publication not found' };
  }

  const pubData = publication as AdPublicationRow & { ad_test_campaigns: { company_id: string } };
  const companyId = pubData.ad_test_campaigns.company_id;
  const newBudgetCents = Math.round(pubData.daily_budget_cents * multiplier);

  const credentials = await getPlatformCredentials(companyId, pubData.platform, supabase);

  if (!credentials) {
    return { success: false, message: `No credentials for ${pubData.platform}` };
  }

  try {
    if (pubData.platform === 'tiktok' && pubData.external_campaign_id) {
      const client = createTikTokAdsClient(credentials as { accessToken: string; advertiserId: string });
      await client.updateCampaignBudget(pubData.external_campaign_id, newBudgetCents);
    } else if (pubData.platform === 'meta' && pubData.external_campaign_id) {
      const client = createMetaAdsClient(credentials as { accessToken: string; adAccountId: string });
      await client.updateDailyBudget(pubData.external_campaign_id, newBudgetCents);
    }

    // Update local record
    await supabase
      .from('ad_publications')
      .update({
        daily_budget_cents: newBudgetCents,
        updated_at: new Date().toISOString(),
      })
      .eq('id', publicationId);

    return {
      success: true,
      message: `Budget scaled to $${(newBudgetCents / 100).toFixed(2)}/day`,
      newBudgetCents,
    };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Failed to scale budget' };
  }
}

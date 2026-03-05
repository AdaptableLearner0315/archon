/**
 * TikTok Ads Business API Client
 * Documentation: https://business-api.tiktok.com/portal/docs
 */

export interface TikTokAdsConfig {
  accessToken: string;
  advertiserId: string;
}

export interface TikTokCampaign {
  id: string;
  name: string;
  status: 'ENABLE' | 'DISABLE' | 'DELETE';
  objective: string;
  budget: number;
  budgetMode: 'BUDGET_MODE_DAY' | 'BUDGET_MODE_TOTAL';
  createdTime: string;
}

export interface TikTokAdGroup {
  id: string;
  campaignId: string;
  name: string;
  status: 'ENABLE' | 'DISABLE' | 'DELETE';
  budget: number;
  budgetMode: 'BUDGET_MODE_DAY' | 'BUDGET_MODE_TOTAL';
  bidPrice: number;
  optimizationGoal: string;
  placement: string[];
}

export interface TikTokAd {
  id: string;
  adGroupId: string;
  name: string;
  status: 'ENABLE' | 'DISABLE' | 'DELETE';
  displayName: string;
  videoId: string;
  callToAction: string;
}

export interface TikTokAdStats {
  campaignId: string;
  adGroupId?: string;
  adId?: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  revenue: number;
  ctr: number;
  cpc: number;
  cpm: number;
  reach: number;
  videoViews: number;
  videoViewsP25: number;
  videoViewsP50: number;
  videoViewsP75: number;
  videoViewsP100: number;
}

export interface TikTokTargeting {
  ageRange?: { min: number; max: number };
  gender?: 'MALE' | 'FEMALE' | 'UNLIMITED';
  languages?: string[];
  locations?: string[];
  interests?: string[];
  behaviors?: string[];
  customAudiences?: string[];
  excludedAudiences?: string[];
}

export interface TikTokCreative {
  videoId: string;
  displayName: string;
  callToAction: string;
  landingPageUrl: string;
  trackingPixelId?: string;
}

interface CampaignConfig {
  name: string;
  objective: 'CONVERSIONS' | 'TRAFFIC' | 'VIDEO_VIEWS' | 'REACH' | 'APP_INSTALL';
  budgetMode: 'BUDGET_MODE_DAY' | 'BUDGET_MODE_TOTAL';
  budget: number;
}

interface AdGroupConfig {
  name: string;
  targeting: TikTokTargeting;
  budget: number;
  budgetMode: 'BUDGET_MODE_DAY' | 'BUDGET_MODE_TOTAL';
  bidPrice: number;
  optimizationGoal: 'CLICK' | 'CONVERSION' | 'SHOW' | 'VIDEO_VIEW';
  placement: ('PLACEMENT_TIKTOK' | 'PLACEMENT_PANGLE' | 'PLACEMENT_GLOBAL_APP_BUNDLE')[];
  scheduleStartTime?: string;
  scheduleEndTime?: string;
}

interface DateRange {
  startDate: string;
  endDate: string;
}

const TIKTOK_API_VERSION = 'v1.3';
const TIKTOK_BASE_URL = 'https://business-api.tiktok.com/open_api';

export class TikTokAdsClient {
  private config: TikTokAdsConfig;

  constructor(config: TikTokAdsConfig) {
    this.config = config;
  }

  /**
   * Make authenticated API request to TikTok Ads API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit & { params?: Record<string, string | number | boolean | string[]> } = {}
  ): Promise<T> {
    const { params = {}, method = 'GET', body, ...fetchOptions } = options;

    const url = new URL(`${TIKTOK_BASE_URL}/${TIKTOK_API_VERSION}/${endpoint}`);

    if (method === 'GET') {
      for (const [key, value] of Object.entries(params)) {
        if (Array.isArray(value)) {
          url.searchParams.set(key, JSON.stringify(value));
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const response = await fetch(url.toString(), {
      method,
      ...fetchOptions,
      headers: {
        'Access-Token': this.config.accessToken,
        'Content-Type': 'application/json',
        ...fetchOptions.headers,
      },
      body: method !== 'GET' ? JSON.stringify({ advertiser_id: this.config.advertiserId, ...params }) : undefined,
    });

    const result = await response.json();

    if (result.code !== 0) {
      throw new Error(`TikTok API error: ${result.message || 'Unknown error'} (code: ${result.code})`);
    }

    return result.data;
  }

  /**
   * Get all campaigns for the advertiser
   */
  async getCampaigns(): Promise<TikTokCampaign[]> {
    const result = await this.request<{ list: Record<string, unknown>[] }>(
      'campaign/get/',
      {
        method: 'GET',
        params: {
          advertiser_id: this.config.advertiserId,
          fields: JSON.stringify(['campaign_id', 'campaign_name', 'status', 'objective_type', 'budget', 'budget_mode', 'create_time']),
        },
      }
    );

    return (result.list || []).map((item) => ({
      id: item.campaign_id as string,
      name: item.campaign_name as string,
      status: item.status as TikTokCampaign['status'],
      objective: item.objective_type as string,
      budget: Number(item.budget) / 100, // TikTok uses cents
      budgetMode: item.budget_mode as TikTokCampaign['budgetMode'],
      createdTime: item.create_time as string,
    }));
  }

  /**
   * Create a new campaign
   */
  async createCampaign(config: CampaignConfig): Promise<{ campaignId: string }> {
    const result = await this.request<{ campaign_id: string }>(
      'campaign/create/',
      {
        method: 'POST',
        params: {
          campaign_name: config.name,
          objective_type: config.objective,
          budget_mode: config.budgetMode,
          budget: config.budget * 100, // Convert dollars to cents
        },
      }
    );

    return { campaignId: result.campaign_id };
  }

  /**
   * Create an ad group within a campaign
   */
  async createAdGroup(campaignId: string, config: AdGroupConfig): Promise<{ adGroupId: string }> {
    const targeting: Record<string, unknown> = {};

    if (config.targeting.ageRange) {
      targeting.age_groups = [`AGE_${config.targeting.ageRange.min}_${config.targeting.ageRange.max}`];
    }
    if (config.targeting.gender && config.targeting.gender !== 'UNLIMITED') {
      targeting.gender = config.targeting.gender;
    }
    if (config.targeting.languages?.length) {
      targeting.languages = config.targeting.languages;
    }
    if (config.targeting.locations?.length) {
      targeting.location_ids = config.targeting.locations;
    }
    if (config.targeting.interests?.length) {
      targeting.interest_category_ids = config.targeting.interests;
    }
    if (config.targeting.behaviors?.length) {
      targeting.action_category_ids = config.targeting.behaviors;
    }
    if (config.targeting.customAudiences?.length) {
      targeting.audience_ids = config.targeting.customAudiences;
    }
    if (config.targeting.excludedAudiences?.length) {
      targeting.excluded_audience_ids = config.targeting.excludedAudiences;
    }

    const result = await this.request<{ adgroup_id: string }>(
      'adgroup/create/',
      {
        method: 'POST',
        params: {
          campaign_id: campaignId,
          adgroup_name: config.name,
          placement_type: 'PLACEMENT_TYPE_NORMAL',
          placements: config.placement,
          budget_mode: config.budgetMode,
          budget: config.budget * 100,
          bid_price: config.bidPrice * 100,
          optimization_goal: config.optimizationGoal,
          billing_event: config.optimizationGoal === 'CLICK' ? 'CPC' : 'CPM',
          ...targeting,
          ...(config.scheduleStartTime && { schedule_start_time: config.scheduleStartTime }),
          ...(config.scheduleEndTime && { schedule_end_time: config.scheduleEndTime }),
        },
      }
    );

    return { adGroupId: result.adgroup_id };
  }

  /**
   * Upload a video for use in ads
   */
  async uploadVideo(videoUrl: string, fileName: string): Promise<{ videoId: string }> {
    const result = await this.request<{ video_id: string }>(
      'file/video/ad/upload/',
      {
        method: 'POST',
        params: {
          video_url: videoUrl,
          file_name: fileName,
        },
      }
    );

    return { videoId: result.video_id };
  }

  /**
   * Create an ad within an ad group
   */
  async createAd(adGroupId: string, creative: TikTokCreative): Promise<{ adId: string }> {
    const creativeData: Record<string, string> = {
      ad_name: creative.displayName,
      display_name: creative.displayName,
      video_id: creative.videoId,
      call_to_action: creative.callToAction,
      landing_page_url: creative.landingPageUrl,
    };

    if (creative.trackingPixelId) {
      creativeData.pixel_id = creative.trackingPixelId;
    }

    const result = await this.request<{ ad_id: string }>(
      'ad/create/',
      {
        method: 'POST',
        params: {
          adgroup_id: adGroupId,
          creatives: JSON.stringify([creativeData]),
        },
      }
    );

    return { adId: result.ad_id };
  }

  /**
   * Get campaign performance statistics
   */
  async getCampaignStats(campaignId: string, dateRange: DateRange): Promise<TikTokAdStats> {
    const result = await this.request<{ list: Record<string, unknown>[] }>(
      'report/integrated/get/',
      {
        method: 'GET',
        params: {
          advertiser_id: this.config.advertiserId,
          report_type: 'BASIC',
          dimensions: JSON.stringify(['campaign_id']),
          data_level: 'AUCTION_CAMPAIGN',
          lifetime: false,
          start_date: dateRange.startDate,
          end_date: dateRange.endDate,
          metrics: JSON.stringify([
            'spend', 'impressions', 'clicks', 'reach', 'ctr', 'cpc', 'cpm',
            'conversion', 'total_complete_payment_rate',
            'video_play_actions', 'video_watched_2s', 'video_watched_6s',
            'average_video_play', 'average_video_play_per_user'
          ]),
          filters: JSON.stringify([{ field_name: 'campaign_id', filter_type: 'IN', filter_value: JSON.stringify([campaignId]) }]),
        },
      }
    );

    const stats = result.list?.[0] || {};
    const metrics = (stats.metrics || {}) as Record<string, string>;

    return {
      campaignId,
      impressions: parseInt(metrics.impressions || '0', 10),
      clicks: parseInt(metrics.clicks || '0', 10),
      spend: parseFloat(metrics.spend || '0'),
      conversions: parseInt(metrics.conversion || '0', 10),
      revenue: 0, // TikTok doesn't provide revenue directly; needs pixel integration
      ctr: parseFloat(metrics.ctr || '0'),
      cpc: parseFloat(metrics.cpc || '0'),
      cpm: parseFloat(metrics.cpm || '0'),
      reach: parseInt(metrics.reach || '0', 10),
      videoViews: parseInt(metrics.video_play_actions || '0', 10),
      videoViewsP25: 0,
      videoViewsP50: 0,
      videoViewsP75: 0,
      videoViewsP100: parseInt(metrics.video_watched_6s || '0', 10),
    };
  }

  /**
   * Get ad-level performance statistics
   */
  async getAdStats(adId: string, dateRange: DateRange): Promise<TikTokAdStats> {
    const result = await this.request<{ list: Record<string, unknown>[] }>(
      'report/integrated/get/',
      {
        method: 'GET',
        params: {
          advertiser_id: this.config.advertiserId,
          report_type: 'BASIC',
          dimensions: JSON.stringify(['ad_id']),
          data_level: 'AUCTION_AD',
          lifetime: false,
          start_date: dateRange.startDate,
          end_date: dateRange.endDate,
          metrics: JSON.stringify([
            'spend', 'impressions', 'clicks', 'reach', 'ctr', 'cpc', 'cpm',
            'conversion', 'video_play_actions'
          ]),
          filters: JSON.stringify([{ field_name: 'ad_id', filter_type: 'IN', filter_value: JSON.stringify([adId]) }]),
        },
      }
    );

    const stats = result.list?.[0] || {};
    const metrics = (stats.metrics || {}) as Record<string, string>;
    const dimensions = (stats.dimensions || {}) as Record<string, string>;

    return {
      campaignId: '',
      adId: dimensions.ad_id,
      impressions: parseInt(metrics.impressions || '0', 10),
      clicks: parseInt(metrics.clicks || '0', 10),
      spend: parseFloat(metrics.spend || '0'),
      conversions: parseInt(metrics.conversion || '0', 10),
      revenue: 0,
      ctr: parseFloat(metrics.ctr || '0'),
      cpc: parseFloat(metrics.cpc || '0'),
      cpm: parseFloat(metrics.cpm || '0'),
      reach: parseInt(metrics.reach || '0', 10),
      videoViews: parseInt(metrics.video_play_actions || '0', 10),
      videoViewsP25: 0,
      videoViewsP50: 0,
      videoViewsP75: 0,
      videoViewsP100: 0,
    };
  }

  /**
   * Update campaign daily budget
   */
  async updateCampaignBudget(campaignId: string, newBudgetCents: number): Promise<{ success: boolean; message: string }> {
    try {
      await this.request(
        'campaign/update/',
        {
          method: 'POST',
          params: {
            campaign_id: campaignId,
            budget: newBudgetCents,
          },
        }
      );

      return { success: true, message: `Budget updated to $${(newBudgetCents / 100).toFixed(2)}/day` };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Update ad group daily budget
   */
  async updateAdGroupBudget(adGroupId: string, newBudgetCents: number): Promise<{ success: boolean; message: string }> {
    try {
      await this.request(
        'adgroup/update/',
        {
          method: 'POST',
          params: {
            adgroup_id: adGroupId,
            budget: newBudgetCents,
          },
        }
      );

      return { success: true, message: `Ad group budget updated to $${(newBudgetCents / 100).toFixed(2)}/day` };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Pause a campaign
   */
  async pauseCampaign(campaignId: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.request(
        'campaign/update/status/',
        {
          method: 'POST',
          params: {
            campaign_ids: [campaignId],
            operation_status: 'DISABLE',
          },
        }
      );

      return { success: true, message: 'Campaign paused' };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Activate a campaign
   */
  async activateCampaign(campaignId: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.request(
        'campaign/update/status/',
        {
          method: 'POST',
          params: {
            campaign_ids: [campaignId],
            operation_status: 'ENABLE',
          },
        }
      );

      return { success: true, message: 'Campaign activated' };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Pause an ad
   */
  async pauseAd(adId: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.request(
        'ad/update/status/',
        {
          method: 'POST',
          params: {
            ad_ids: [adId],
            operation_status: 'DISABLE',
          },
        }
      );

      return { success: true, message: 'Ad paused' };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Activate an ad
   */
  async activateAd(adId: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.request(
        'ad/update/status/',
        {
          method: 'POST',
          params: {
            ad_ids: [adId],
            operation_status: 'ENABLE',
          },
        }
      );

      return { success: true, message: 'Ad activated' };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Get advertiser account info
   */
  async getAccountInfo(): Promise<{
    advertiserId: string;
    name: string;
    balance: number;
    currency: string;
    status: string;
  }> {
    const result = await this.request<{ list: Record<string, unknown>[] }>(
      'advertiser/info/',
      {
        method: 'GET',
        params: {
          advertiser_ids: JSON.stringify([this.config.advertiserId]),
        },
      }
    );

    const info = result.list?.[0] || {};

    return {
      advertiserId: info.advertiser_id as string,
      name: info.name as string,
      balance: Number(info.balance) / 100,
      currency: info.currency as string,
      status: info.status as string,
    };
  }
}

/**
 * Factory to create client from encrypted credentials
 */
export function createTikTokAdsClient(decryptedCredentials: {
  accessToken: string;
  advertiserId: string;
}): TikTokAdsClient {
  return new TikTokAdsClient({
    accessToken: decryptedCredentials.accessToken,
    advertiserId: decryptedCredentials.advertiserId,
  });
}

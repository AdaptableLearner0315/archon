/**
 * Google Ads API Client
 * REST API integration for Google Ads management
 */

export interface GoogleAdsConfig {
  clientId: string;
  clientSecret: string;
  developerToken: string;
  refreshToken: string;
  customerId: string;
}

export interface GoogleCampaign {
  id: string;
  name: string;
  status: 'ENABLED' | 'PAUSED' | 'REMOVED';
  dailyBudgetMicros: number;
  campaignType: string;
  startDate: string;
  endDate?: string;
}

export interface GoogleCampaignStats {
  campaignId: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  ctr: number;
  cpc: number;
  conversionRate: number;
}

const GOOGLE_ADS_API_VERSION = 'v16';
const GOOGLE_ADS_BASE_URL = 'https://googleads.googleapis.com';

export class GoogleAdsClient {
  private config: GoogleAdsConfig;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: GoogleAdsConfig) {
    this.config = config;
  }

  /**
   * Get or refresh access token
   */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry - 60000) {
      return this.accessToken;
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: this.config.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to refresh Google Ads token: ${response.statusText}`);
    }

    const data = await response.json() as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000);

    return this.accessToken!;
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const accessToken = await this.getAccessToken();
    const url = `${GOOGLE_ADS_BASE_URL}/${GOOGLE_ADS_API_VERSION}/${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': this.config.developerToken,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google Ads API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Get all campaigns
   */
  async getCampaigns(): Promise<GoogleCampaign[]> {
    const query = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        campaign.start_date,
        campaign.end_date,
        campaign_budget.amount_micros
      FROM campaign
      WHERE campaign.status != 'REMOVED'
      ORDER BY campaign.name
    `;

    const result = await this.request<{ results: unknown[] }>(
      `customers/${this.config.customerId}/googleAds:searchStream`,
      {
        method: 'POST',
        body: JSON.stringify({ query }),
      }
    );

    return (result.results || []).map((item) => {
      const row = item as { campaign?: Record<string, string>; campaignBudget?: Record<string, string> };
      return {
        id: row.campaign?.id || '',
        name: row.campaign?.name || '',
        status: (row.campaign?.status || 'PAUSED') as GoogleCampaign['status'],
        dailyBudgetMicros: parseInt(row.campaignBudget?.amountMicros || '0', 10),
        campaignType: row.campaign?.advertisingChannelType || '',
        startDate: row.campaign?.startDate || '',
        endDate: row.campaign?.endDate,
      };
    });
  }

  /**
   * Get campaign performance stats
   */
  async getCampaignStats(
    campaignId: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<GoogleCampaignStats> {
    const query = `
      SELECT
        campaign.id,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.ctr,
        metrics.average_cpc,
        metrics.conversions_from_interactions_rate
      FROM campaign
      WHERE campaign.id = '${campaignId}'
        AND segments.date BETWEEN '${dateRange.startDate}' AND '${dateRange.endDate}'
    `;

    const result = await this.request<{ results: unknown[] }>(
      `customers/${this.config.customerId}/googleAds:searchStream`,
      {
        method: 'POST',
        body: JSON.stringify({ query }),
      }
    );

    const metrics = (result.results?.[0] as Record<string, Record<string, string>>)?.metrics || {};

    return {
      campaignId,
      impressions: parseInt(metrics.impressions || '0', 10),
      clicks: parseInt(metrics.clicks || '0', 10),
      costMicros: parseInt(metrics.costMicros || '0', 10),
      conversions: parseFloat(metrics.conversions || '0'),
      ctr: parseFloat(metrics.ctr || '0'),
      cpc: parseInt(metrics.averageCpc || '0', 10) / 1000000,
      conversionRate: parseFloat(metrics.conversionsFromInteractionsRate || '0'),
    };
  }

  /**
   * Update campaign daily budget
   */
  async updateBudget(
    campaignId: string,
    newBudgetMicros: number
  ): Promise<{ success: boolean; message: string }> {
    // First get the campaign to find its budget resource
    const campaigns = await this.getCampaigns();
    const campaign = campaigns.find(c => c.id === campaignId);

    if (!campaign) {
      return { success: false, message: `Campaign ${campaignId} not found` };
    }

    // Update budget via mutate
    const operations = [{
      updateMask: 'amount_micros',
      update: {
        resourceName: `customers/${this.config.customerId}/campaignBudgets/${campaignId}`,
        amountMicros: newBudgetMicros.toString(),
      },
    }];

    try {
      await this.request(
        `customers/${this.config.customerId}/campaignBudgets:mutate`,
        {
          method: 'POST',
          body: JSON.stringify({ operations }),
        }
      );

      return { success: true, message: `Budget updated to $${(newBudgetMicros / 1000000).toFixed(2)}/day` };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Pause a campaign
   */
  async pauseCampaign(campaignId: string): Promise<{ success: boolean; message: string }> {
    const operations = [{
      updateMask: 'status',
      update: {
        resourceName: `customers/${this.config.customerId}/campaigns/${campaignId}`,
        status: 'PAUSED',
      },
    }];

    try {
      await this.request(
        `customers/${this.config.customerId}/campaigns:mutate`,
        {
          method: 'POST',
          body: JSON.stringify({ operations }),
        }
      );

      return { success: true, message: 'Campaign paused' };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Enable a campaign
   */
  async enableCampaign(campaignId: string): Promise<{ success: boolean; message: string }> {
    const operations = [{
      updateMask: 'status',
      update: {
        resourceName: `customers/${this.config.customerId}/campaigns/${campaignId}`,
        status: 'ENABLED',
      },
    }];

    try {
      await this.request(
        `customers/${this.config.customerId}/campaigns:mutate`,
        {
          method: 'POST',
          body: JSON.stringify({ operations }),
        }
      );

      return { success: true, message: 'Campaign enabled' };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}

/**
 * Factory to create client from encrypted credentials
 */
export function createGoogleAdsClient(decryptedCredentials: {
  refreshToken: string;
  customerId: string;
}): GoogleAdsClient {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

  if (!clientId || !clientSecret || !developerToken) {
    throw new Error('Google Ads environment variables not configured');
  }

  return new GoogleAdsClient({
    clientId,
    clientSecret,
    developerToken,
    refreshToken: decryptedCredentials.refreshToken,
    customerId: decryptedCredentials.customerId,
  });
}

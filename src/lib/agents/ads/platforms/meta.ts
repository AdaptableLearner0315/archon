/**
 * Meta Marketing API Client
 * Facebook/Instagram Ads management
 */

export interface MetaAdsConfig {
  accessToken: string;
  adAccountId: string;
}

export interface MetaCampaign {
  id: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED';
  objective: string;
  dailyBudget: number;
  lifetimeBudget: number;
  createdTime: string;
}

export interface MetaAdSet {
  id: string;
  name: string;
  campaignId: string;
  status: 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED';
  dailyBudget: number;
  lifetimeBudget: number;
  targeting: Record<string, unknown>;
}

export interface MetaAdStats {
  campaignId: string;
  impressions: number;
  reach: number;
  clicks: number;
  spend: number;
  actions: { actionType: string; value: number }[];
  cpc: number;
  cpm: number;
  ctr: number;
  frequency: number;
}

const META_API_VERSION = 'v19.0';
const META_BASE_URL = 'https://graph.facebook.com';

export class MetaAdsClient {
  private config: MetaAdsConfig;

  constructor(config: MetaAdsConfig) {
    this.config = config;
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit & { params?: Record<string, string> } = {}
  ): Promise<T> {
    const { params = {}, ...fetchOptions } = options;

    const url = new URL(`${META_BASE_URL}/${META_API_VERSION}/${endpoint}`);
    url.searchParams.set('access_token', this.config.accessToken);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString(), {
      ...fetchOptions,
      headers: {
        'Content-Type': 'application/json',
        ...fetchOptions.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(`Meta API error: ${error.error?.message || response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get all campaigns
   */
  async getCampaigns(): Promise<MetaCampaign[]> {
    const result = await this.request<{ data: unknown[] }>(
      `act_${this.config.adAccountId}/campaigns`,
      {
        params: {
          fields: 'id,name,status,objective,daily_budget,lifetime_budget,created_time',
          limit: '100',
        },
      }
    );

    return (result.data || []).map((item) => {
      const row = item as Record<string, string>;
      return {
        id: row.id,
        name: row.name,
        status: (row.status || 'PAUSED') as MetaCampaign['status'],
        objective: row.objective,
        dailyBudget: parseInt(row.daily_budget || '0', 10) / 100, // Convert cents to dollars
        lifetimeBudget: parseInt(row.lifetime_budget || '0', 10) / 100,
        createdTime: row.created_time,
      };
    });
  }

  /**
   * Get ad sets for a campaign
   */
  async getAdSets(campaignId?: string): Promise<MetaAdSet[]> {
    const endpoint = campaignId
      ? `${campaignId}/adsets`
      : `act_${this.config.adAccountId}/adsets`;

    const result = await this.request<{ data: unknown[] }>(endpoint, {
      params: {
        fields: 'id,name,campaign_id,status,daily_budget,lifetime_budget,targeting',
        limit: '100',
      },
    });

    return (result.data || []).map((item) => {
      const row = item as Record<string, unknown>;
      return {
        id: row.id as string,
        name: row.name as string,
        campaignId: row.campaign_id as string,
        status: (row.status || 'PAUSED') as MetaAdSet['status'],
        dailyBudget: parseInt((row.daily_budget as string) || '0', 10) / 100,
        lifetimeBudget: parseInt((row.lifetime_budget as string) || '0', 10) / 100,
        targeting: (row.targeting || {}) as Record<string, unknown>,
      };
    });
  }

  /**
   * Get campaign performance stats
   */
  async getCampaignStats(
    campaignId: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<MetaAdStats> {
    const result = await this.request<{ data: unknown[] }>(
      `${campaignId}/insights`,
      {
        params: {
          fields: 'impressions,reach,clicks,spend,actions,cpc,cpm,ctr,frequency',
          time_range: JSON.stringify({
            since: dateRange.startDate,
            until: dateRange.endDate,
          }),
        },
      }
    );

    const insights = (result.data?.[0] || {}) as Record<string, unknown>;

    return {
      campaignId,
      impressions: parseInt((insights.impressions as string) || '0', 10),
      reach: parseInt((insights.reach as string) || '0', 10),
      clicks: parseInt((insights.clicks as string) || '0', 10),
      spend: parseFloat((insights.spend as string) || '0'),
      actions: ((insights.actions as { action_type: string; value: string }[]) || []).map(a => ({
        actionType: a.action_type,
        value: parseInt(a.value, 10),
      })),
      cpc: parseFloat((insights.cpc as string) || '0'),
      cpm: parseFloat((insights.cpm as string) || '0'),
      ctr: parseFloat((insights.ctr as string) || '0'),
      frequency: parseFloat((insights.frequency as string) || '0'),
    };
  }

  /**
   * Update campaign daily budget
   */
  async updateDailyBudget(
    campaignId: string,
    newBudgetCents: number
  ): Promise<{ success: boolean; message: string }> {
    try {
      await this.request(campaignId, {
        method: 'POST',
        body: JSON.stringify({
          daily_budget: newBudgetCents,
        }),
      });

      return { success: true, message: `Budget updated to $${(newBudgetCents / 100).toFixed(2)}/day` };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Update ad set daily budget
   */
  async updateAdSetBudget(
    adSetId: string,
    newBudgetCents: number
  ): Promise<{ success: boolean; message: string }> {
    try {
      await this.request(adSetId, {
        method: 'POST',
        body: JSON.stringify({
          daily_budget: newBudgetCents,
        }),
      });

      return { success: true, message: `Ad set budget updated to $${(newBudgetCents / 100).toFixed(2)}/day` };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Pause a campaign
   */
  async pauseCampaign(campaignId: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.request(campaignId, {
        method: 'POST',
        body: JSON.stringify({ status: 'PAUSED' }),
      });

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
      await this.request(campaignId, {
        method: 'POST',
        body: JSON.stringify({ status: 'ACTIVE' }),
      });

      return { success: true, message: 'Campaign activated' };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Get account spending limit info
   */
  async getAccountSpendingInfo(): Promise<{
    spendCap: number;
    amountSpent: number;
    remainingBudget: number;
  }> {
    const result = await this.request<Record<string, string>>(
      `act_${this.config.adAccountId}`,
      {
        params: {
          fields: 'spend_cap,amount_spent',
        },
      }
    );

    const spendCap = parseFloat(result.spend_cap || '0') / 100;
    const amountSpent = parseFloat(result.amount_spent || '0') / 100;

    return {
      spendCap,
      amountSpent,
      remainingBudget: spendCap - amountSpent,
    };
  }
}

/**
 * Factory to create client from encrypted credentials
 */
export function createMetaAdsClient(decryptedCredentials: {
  accessToken: string;
  adAccountId: string;
}): MetaAdsClient {
  return new MetaAdsClient({
    accessToken: decryptedCredentials.accessToken,
    adAccountId: decryptedCredentials.adAccountId,
  });
}

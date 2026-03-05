/**
 * Provisioning System Types
 * Types for OAuth, deployments, and connected accounts
 */

export type OAuthProvider =
  | 'vercel'
  | 'twitter'
  | 'youtube'
  | 'linkedin'
  | 'tiktok'
  | 'supabase';

export type AccountStatus = 'active' | 'expired' | 'revoked';

export type ProvisionJobType =
  | 'landing_deploy'
  | 'database_migrate'
  | 'email_setup'
  | 'social_post'
  | 'social_schedule'
  | 'ads_campaign';

export type ProvisionJobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'rolled_back';

export type ScheduledPostStatus =
  | 'scheduled'
  | 'posting'
  | 'posted'
  | 'failed'
  | 'cancelled';

export type SocialPlatform =
  | 'twitter'
  | 'linkedin'
  | 'youtube'
  | 'tiktok'
  | 'instagram';

export interface ConnectedAccount {
  id: string;
  company_id: string;
  provider: OAuthProvider;
  provider_account_id: string | null;
  account_name: string | null;
  status: AccountStatus;
  scopes: string[];
  metadata: Record<string, unknown>;
  connected_at: string;
  updated_at: string;
}

export interface OAuthTokens {
  id: string;
  connected_account_id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  token_type: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DecryptedTokens {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  expiresAt: Date | null;
}

export interface ProvisionJob {
  id: string;
  company_id: string;
  type: ProvisionJobType;
  status: ProvisionJobStatus;
  progress: number;
  current_step: string | null;
  result: Record<string, unknown>;
  error: string | null;
  rollback_data: Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface ScheduledPost {
  id: string;
  company_id: string;
  platform: SocialPlatform;
  content: string;
  media_urls: string[];
  scheduled_for: string;
  status: ScheduledPostStatus;
  external_post_id: string | null;
  error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Retry tracking fields
  retry_count?: number;
  max_retries?: number;
  last_retry_at?: string;
  post_type?: 'single' | 'thread' | 'reply' | 'quote';
  source?: 'calendar' | 'manual' | 'api';
}

export interface SocialProfileSetup {
  id: string;
  company_id: string;
  platform: 'twitter' | 'linkedin';
  setup_type: 'bio' | 'pinned' | 'header';
  content: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  external_id: string | null;
  error: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OAuthCallbackResult {
  success: boolean;
  account?: ConnectedAccount;
  error?: string;
}

export interface ProviderInfo {
  id: OAuthProvider;
  name: string;
  description: string;
  icon: string;
  scopes: string[];
  features: string[];
  costNote?: string;
}

export const PROVIDER_INFO: Record<OAuthProvider, ProviderInfo> = {
  vercel: {
    id: 'vercel',
    name: 'Vercel',
    description: 'Deploy landing pages with custom domains',
    icon: 'vercel',
    scopes: ['read:projects', 'write:deployments'],
    features: ['Landing page deployment', 'Custom domains', 'SSL certificates'],
    costNote: 'Vercel Pro ($20/mo) required for custom domains',
  },
  twitter: {
    id: 'twitter',
    name: 'Twitter / X',
    description: 'Post updates and manage your Twitter presence',
    icon: 'twitter',
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    features: ['Post tweets', 'Schedule posts', 'Update profile'],
    costNote: 'Twitter API Basic ($100/mo) for higher rate limits',
  },
  youtube: {
    id: 'youtube',
    name: 'YouTube',
    description: 'Upload videos and manage your channel',
    icon: 'youtube',
    scopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'],
    features: ['Video upload', 'Channel management', 'Analytics'],
  },
  linkedin: {
    id: 'linkedin',
    name: 'LinkedIn',
    description: 'Post to company pages and engage professionally',
    icon: 'linkedin',
    scopes: ['w_organization_social', 'r_organization_social'],
    features: ['Company posts', 'Professional networking'],
  },
  tiktok: {
    id: 'tiktok',
    name: 'TikTok',
    description: 'Run TikTok ad campaigns',
    icon: 'tiktok',
    scopes: ['ads.management'],
    features: ['Ad campaigns', 'Audience targeting'],
  },
  supabase: {
    id: 'supabase',
    name: 'Supabase',
    description: 'Execute database migrations on your project',
    icon: 'supabase',
    scopes: ['database.write'],
    features: ['Run migrations', 'Backup before changes'],
    costNote: 'Requires service role key with write access',
  },
};

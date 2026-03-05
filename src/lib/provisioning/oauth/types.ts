/**
 * OAuth Types and Provider Configuration
 */

import type { OAuthProvider } from '../types';

export interface OAuthConfig {
  provider: OAuthProvider;
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  revokeUrl?: string;
  scopes: string[];
  usePKCE?: boolean;
  additionalParams?: Record<string, string>;
}

export interface OAuthState {
  provider: OAuthProvider;
  companyId: string;
  returnUrl: string;
  codeVerifier?: string; // For PKCE
  nonce: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
}

export interface RefreshedTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
}

export interface ProviderAccountInfo {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
}

export function getOAuthConfig(provider: OAuthProvider): OAuthConfig {
  const configs: Record<OAuthProvider, OAuthConfig> = {
    vercel: {
      provider: 'vercel',
      clientId: process.env.VERCEL_CLIENT_ID || '',
      clientSecret: process.env.VERCEL_CLIENT_SECRET || '',
      authorizationUrl: 'https://vercel.com/integrations/oauth/authorize',
      tokenUrl: 'https://api.vercel.com/v2/oauth/access_token',
      scopes: [],
      additionalParams: {},
    },
    twitter: {
      provider: 'twitter',
      clientId: process.env.TWITTER_CLIENT_ID || '',
      clientSecret: process.env.TWITTER_CLIENT_SECRET || '',
      authorizationUrl: 'https://twitter.com/i/oauth2/authorize',
      tokenUrl: 'https://api.twitter.com/2/oauth2/token',
      revokeUrl: 'https://api.twitter.com/2/oauth2/revoke',
      scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
      usePKCE: true,
    },
    youtube: {
      provider: 'youtube',
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      revokeUrl: 'https://oauth2.googleapis.com/revoke',
      scopes: [
        'https://www.googleapis.com/auth/youtube.upload',
        'https://www.googleapis.com/auth/youtube.readonly',
      ],
      additionalParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
    linkedin: {
      provider: 'linkedin',
      clientId: process.env.LINKEDIN_CLIENT_ID || '',
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
      authorizationUrl: 'https://www.linkedin.com/oauth/v2/authorization',
      tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
      scopes: ['w_organization_social', 'r_organization_social'],
    },
    tiktok: {
      provider: 'tiktok',
      clientId: process.env.TIKTOK_CLIENT_KEY || '',
      clientSecret: process.env.TIKTOK_CLIENT_SECRET || '',
      authorizationUrl: 'https://business-api.tiktok.com/portal/auth',
      tokenUrl: 'https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/',
      scopes: ['ads.management'],
    },
    supabase: {
      provider: 'supabase',
      clientId: '', // Supabase uses direct credentials, not OAuth
      clientSecret: '',
      authorizationUrl: '',
      tokenUrl: '',
      scopes: [],
    },
  };

  return configs[provider];
}

export function validateOAuthConfig(config: OAuthConfig): boolean {
  // Supabase doesn't use OAuth
  if (config.provider === 'supabase') {
    return true;
  }

  return !!(config.clientId && config.clientSecret && config.authorizationUrl && config.tokenUrl);
}

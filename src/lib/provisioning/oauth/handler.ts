/**
 * Generic OAuth Flow Handler
 * Handles authorization, token exchange, and connection management
 */

import { createClient } from '@/lib/supabase/server';
import { randomBytes, createHash } from 'crypto';
import { storeTokens, deleteTokens } from '../tokens';
import type { OAuthProvider, ConnectedAccount, OAuthCallbackResult } from '../types';
import { getOAuthConfig, validateOAuthConfig, type OAuthState, type TokenResponse } from './types';

const OAUTH_STATE_COOKIE_PREFIX = 'oauth_state_';

/**
 * Generate a random state/nonce for OAuth
 */
function generateNonce(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Generate PKCE code verifier and challenge
 */
function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  return { codeVerifier, codeChallenge };
}

/**
 * Initiate OAuth flow - returns authorization URL and state
 */
export async function initiateOAuth(
  provider: OAuthProvider,
  companyId: string,
  returnUrl: string
): Promise<{ authUrl: string; state: OAuthState }> {
  const config = getOAuthConfig(provider);

  if (!validateOAuthConfig(config)) {
    throw new Error(`OAuth not configured for ${provider}. Please set environment variables.`);
  }

  const nonce = generateNonce();
  const state: OAuthState = {
    provider,
    companyId,
    returnUrl,
    nonce,
  };

  // Build authorization URL
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/${provider}/callback`,
    response_type: 'code',
    state: Buffer.from(JSON.stringify(state)).toString('base64'),
    ...(config.scopes.length > 0 && { scope: config.scopes.join(' ') }),
    ...config.additionalParams,
  });

  // Add PKCE if required
  if (config.usePKCE) {
    const { codeVerifier, codeChallenge } = generatePKCE();
    state.codeVerifier = codeVerifier;
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', 'S256');
  }

  const authUrl = `${config.authorizationUrl}?${params.toString()}`;

  return { authUrl, state };
}

/**
 * Handle OAuth callback - exchange code for tokens
 */
export async function handleOAuthCallback(
  provider: OAuthProvider,
  code: string,
  state: OAuthState
): Promise<OAuthCallbackResult> {
  const config = getOAuthConfig(provider);
  const supabase = await createClient();

  try {
    // Verify company ownership
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('id', state.companyId)
      .eq('user_id', user.id)
      .single();

    if (!company) {
      return { success: false, error: 'Company not found' };
    }

    // Exchange code for tokens
    const tokenParams = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/${provider}/callback`,
    });

    // Add code verifier for PKCE
    if (config.usePKCE && state.codeVerifier) {
      tokenParams.set('code_verifier', state.codeVerifier);
    }

    const tokenResponse = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: tokenParams.toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error(`OAuth token exchange failed for ${provider}:`, errorText);
      return { success: false, error: 'Failed to exchange authorization code' };
    }

    const tokens: TokenResponse = await tokenResponse.json();

    // Get provider account info
    const accountInfo = await getProviderAccountInfo(provider, tokens.access_token);

    // Calculate token expiry
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    // Create or update connected account
    const { data: existingAccount } = await supabase
      .from('connected_accounts')
      .select('id')
      .eq('company_id', state.companyId)
      .eq('provider', provider)
      .single();

    let account: ConnectedAccount;

    if (existingAccount) {
      // Update existing
      const { data, error } = await supabase
        .from('connected_accounts')
        .update({
          provider_account_id: accountInfo?.id || null,
          account_name: accountInfo?.name || null,
          status: 'active',
          scopes: tokens.scope?.split(' ') || config.scopes,
          connected_at: new Date().toISOString(),
        })
        .eq('id', existingAccount.id)
        .select()
        .single();

      if (error) throw error;
      account = data;
    } else {
      // Insert new
      const { data, error } = await supabase
        .from('connected_accounts')
        .insert({
          company_id: state.companyId,
          provider,
          provider_account_id: accountInfo?.id || null,
          account_name: accountInfo?.name || null,
          status: 'active',
          scopes: tokens.scope?.split(' ') || config.scopes,
        })
        .select()
        .single();

      if (error) throw error;
      account = data;
    }

    // Store encrypted tokens
    await storeTokens(
      account.id,
      tokens.access_token,
      tokens.refresh_token || null,
      expiresAt,
      tokens.token_type
    );

    return { success: true, account };
  } catch (error) {
    console.error(`OAuth callback error for ${provider}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Revoke OAuth connection and delete tokens
 */
export async function revokeOAuthConnection(
  companyId: string,
  provider: OAuthProvider
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  try {
    // Verify ownership
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .eq('user_id', user.id)
      .single();

    if (!company) {
      return { success: false, error: 'Company not found' };
    }

    // Get account
    const { data: account } = await supabase
      .from('connected_accounts')
      .select('id')
      .eq('company_id', companyId)
      .eq('provider', provider)
      .single();

    if (!account) {
      return { success: false, error: 'Account not connected' };
    }

    // Delete tokens first (will cascade from account deletion anyway)
    await deleteTokens(account.id);

    // Delete account
    const { error } = await supabase
      .from('connected_accounts')
      .delete()
      .eq('id', account.id);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error(`Revoke OAuth error for ${provider}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get provider account info after authorization
 */
async function getProviderAccountInfo(
  provider: OAuthProvider,
  accessToken: string
): Promise<{ id: string; name: string } | null> {
  try {
    // Import provider-specific info fetcher
    const providerModule = await import(`./providers/${provider}`);
    if (providerModule.getAccountInfo) {
      return providerModule.getAccountInfo(accessToken);
    }
  } catch {
    // Provider module not found or doesn't export getAccountInfo
  }
  return null;
}

/**
 * Encode state for URL parameter
 */
export function encodeOAuthState(state: OAuthState): string {
  return Buffer.from(JSON.stringify(state)).toString('base64url');
}

/**
 * Decode state from URL parameter
 */
export function decodeOAuthState(encoded: string): OAuthState | null {
  try {
    const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
    return JSON.parse(decoded) as OAuthState;
  } catch {
    return null;
  }
}

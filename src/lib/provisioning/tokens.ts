/**
 * OAuth Token Encryption/Decryption
 * Uses AES-256-GCM for secure storage of OAuth tokens
 * Reuses pattern from /lib/agents/ads/credentials.ts
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import type { DecryptedTokens, OAuthProvider } from './types';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY environment variable not set');
  }
  return Buffer.from(key.padEnd(32, '0').slice(0, 32));
}

/**
 * Encrypt a single token string
 */
export function encryptToken(token: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(token, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Combine: iv + authTag + encrypted data
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString('base64');
}

/**
 * Decrypt a single token string
 */
export function decryptToken(encryptedString: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedString, 'base64');

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Store OAuth tokens for a connected account
 */
export async function storeTokens(
  connectedAccountId: string,
  accessToken: string,
  refreshToken: string | null,
  expiresAt: Date | null,
  tokenType = 'Bearer'
): Promise<void> {
  const supabase = await createClient();

  const tokenData = {
    connected_account_id: connectedAccountId,
    access_token_encrypted: encryptToken(accessToken),
    refresh_token_encrypted: refreshToken ? encryptToken(refreshToken) : null,
    token_type: tokenType,
    expires_at: expiresAt?.toISOString() ?? null,
  };

  // Upsert - replace if exists
  const { error } = await supabase
    .from('oauth_tokens')
    .upsert(tokenData, { onConflict: 'connected_account_id' });

  if (error) {
    throw new Error(`Failed to store tokens: ${error.message}`);
  }
}

/**
 * Get decrypted tokens for a connected account
 */
export async function getTokens(
  connectedAccountId: string
): Promise<DecryptedTokens | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('oauth_tokens')
    .select('*')
    .eq('connected_account_id', connectedAccountId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    accessToken: decryptToken(data.access_token_encrypted),
    refreshToken: data.refresh_token_encrypted
      ? decryptToken(data.refresh_token_encrypted)
      : null,
    tokenType: data.token_type,
    expiresAt: data.expires_at ? new Date(data.expires_at) : null,
  };
}

/**
 * Get tokens for a company and provider
 */
export async function getTokensForProvider(
  companyId: string,
  provider: OAuthProvider
): Promise<DecryptedTokens | null> {
  const supabase = await createClient();

  const { data: account } = await supabase
    .from('connected_accounts')
    .select('id')
    .eq('company_id', companyId)
    .eq('provider', provider)
    .eq('status', 'active')
    .single();

  if (!account) {
    return null;
  }

  return getTokens(account.id);
}

/**
 * Check if tokens are expired (with 5 minute buffer)
 */
export function isTokenExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) {
    return false; // No expiry means it doesn't expire
  }
  const bufferMs = 5 * 60 * 1000; // 5 minutes
  return new Date().getTime() > expiresAt.getTime() - bufferMs;
}

/**
 * Refresh tokens using the refresh token
 * Returns new tokens or null if refresh failed
 */
export async function refreshTokens(
  connectedAccountId: string,
  provider: OAuthProvider,
  refreshToken: string
): Promise<DecryptedTokens | null> {
  // Import provider-specific refresh logic
  const { refreshAccessToken } = await import(`./oauth/providers/${provider}`);

  try {
    const newTokens = await refreshAccessToken(refreshToken);

    if (newTokens) {
      await storeTokens(
        connectedAccountId,
        newTokens.accessToken,
        newTokens.refreshToken,
        newTokens.expiresAt
      );
      return newTokens;
    }
  } catch (error) {
    console.error(`Failed to refresh tokens for ${provider}:`, error);

    // Mark account as expired
    const supabase = await createClient();
    await supabase
      .from('connected_accounts')
      .update({ status: 'expired' })
      .eq('id', connectedAccountId);
  }

  return null;
}

/**
 * Get valid (non-expired) tokens, refreshing if needed
 */
export async function getValidTokens(
  companyId: string,
  provider: OAuthProvider
): Promise<DecryptedTokens | null> {
  const supabase = await createClient();

  const { data: account } = await supabase
    .from('connected_accounts')
    .select('id, status')
    .eq('company_id', companyId)
    .eq('provider', provider)
    .single();

  if (!account || account.status !== 'active') {
    return null;
  }

  const tokens = await getTokens(account.id);
  if (!tokens) {
    return null;
  }

  // Check if expired
  if (isTokenExpired(tokens.expiresAt)) {
    if (tokens.refreshToken) {
      return refreshTokens(account.id, provider, tokens.refreshToken);
    }
    // No refresh token and expired - mark as expired
    await supabase
      .from('connected_accounts')
      .update({ status: 'expired' })
      .eq('id', account.id);
    return null;
  }

  return tokens;
}

/**
 * Delete tokens for a connected account
 */
export async function deleteTokens(connectedAccountId: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('oauth_tokens')
    .delete()
    .eq('connected_account_id', connectedAccountId);

  if (error) {
    throw new Error(`Failed to delete tokens: ${error.message}`);
  }
}

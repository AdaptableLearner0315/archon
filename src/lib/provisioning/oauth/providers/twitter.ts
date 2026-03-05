/**
 * Twitter/X OAuth Provider
 * Handles Twitter OAuth 2.0 with PKCE
 */

import type { RefreshedTokens, ProviderAccountInfo } from '../types';

const TWITTER_API_BASE = 'https://api.twitter.com/2';

/**
 * Get Twitter account info
 */
export async function getAccountInfo(
  accessToken: string
): Promise<ProviderAccountInfo | null> {
  try {
    const response = await fetch(`${TWITTER_API_BASE}/users/me?user.fields=profile_image_url,name,username`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const { data } = await response.json();

    return {
      id: data.id,
      name: data.name || data.username,
      avatar: data.profile_image_url,
    };
  } catch (error) {
    console.error('Failed to get Twitter account info:', error);
    return null;
  }
}

/**
 * Refresh Twitter access token
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<RefreshedTokens | null> {
  try {
    const clientId = process.env.TWITTER_CLIENT_ID || '';
    const clientSecret = process.env.TWITTER_CLIENT_SECRET || '';
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch(`${TWITTER_API_BASE}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        client_id: clientId,
      }).toString(),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Twitter token refresh failed:', errorData);
      return null;
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : null,
    };
  } catch (error) {
    console.error('Failed to refresh Twitter token:', error);
    return null;
  }
}

/**
 * Post a tweet
 */
export async function postTweet(
  accessToken: string,
  text: string,
  replyToId?: string
): Promise<{ id: string; text: string } | null> {
  try {
    const body: { text: string; reply?: { in_reply_to_tweet_id: string } } = { text };
    if (replyToId) {
      body.reply = { in_reply_to_tweet_id: replyToId };
    }

    const response = await fetch(`${TWITTER_API_BASE}/tweets`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Tweet post failed:', errorData);
      return null;
    }

    const { data } = await response.json();
    return { id: data.id, text: data.text };
  } catch (error) {
    console.error('Failed to post tweet:', error);
    return null;
  }
}

/**
 * Delete a tweet
 */
export async function deleteTweet(
  accessToken: string,
  tweetId: string
): Promise<boolean> {
  try {
    const response = await fetch(`${TWITTER_API_BASE}/tweets/${tweetId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to delete tweet:', error);
    return false;
  }
}

/**
 * Get user's recent tweets
 */
export async function getRecentTweets(
  accessToken: string,
  userId: string,
  maxResults = 10
): Promise<Array<{ id: string; text: string; created_at: string }>> {
  try {
    const response = await fetch(
      `${TWITTER_API_BASE}/users/${userId}/tweets?max_results=${maxResults}&tweet.fields=created_at`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      return [];
    }

    const { data } = await response.json();
    return data || [];
  } catch (error) {
    console.error('Failed to get recent tweets:', error);
    return [];
  }
}

/**
 * Update Twitter profile bio/description
 * Note: Requires OAuth 1.0a or elevated access for account/update_profile
 */
export async function updateProfile(
  accessToken: string,
  options: {
    description?: string;
    name?: string;
    url?: string;
    location?: string;
  }
): Promise<boolean> {
  try {
    // Twitter API v2 doesn't have profile update endpoint yet
    // Using v1.1 endpoint which requires OAuth 1.0a
    // For now, we'll use the v1.1 endpoint with Bearer token (limited functionality)
    const params = new URLSearchParams();
    if (options.description) params.append('description', options.description);
    if (options.name) params.append('name', options.name);
    if (options.url) params.append('url', options.url);
    if (options.location) params.append('location', options.location);

    const response = await fetch(
      `https://api.twitter.com/1.1/account/update_profile.json?${params.toString()}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Profile update failed:', errorData);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to update Twitter profile:', error);
    return false;
  }
}

/**
 * Pin a tweet to the user's profile
 * Note: Requires write access and user context
 */
export async function pinTweet(
  accessToken: string,
  userId: string,
  tweetId: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `${TWITTER_API_BASE}/users/${userId}/pinned_lists`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tweet_id: tweetId }),
      }
    );

    // Twitter API for pinning isn't directly available in v2
    // Using workaround - this may need OAuth 1.0a in production
    if (!response.ok) {
      // Try alternative endpoint
      const altResponse = await fetch(
        `https://api.twitter.com/1.1/account/pin_tweet.json?id=${tweetId}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!altResponse.ok) {
        const errorData = await altResponse.json();
        console.error('Pin tweet failed:', errorData);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('Failed to pin tweet:', error);
    return false;
  }
}

/**
 * Post a thread (multiple connected tweets)
 */
export async function postThread(
  accessToken: string,
  tweets: string[]
): Promise<Array<{ id: string; text: string }> | null> {
  if (tweets.length === 0) return null;

  const results: Array<{ id: string; text: string }> = [];
  let previousTweetId: string | undefined;

  for (const tweetText of tweets) {
    const result = await postTweet(accessToken, tweetText, previousTweetId);
    if (!result) {
      console.error('Thread posting failed at tweet:', tweetText.substring(0, 50));
      return results.length > 0 ? results : null;
    }
    results.push(result);
    previousTweetId = result.id;
  }

  return results;
}

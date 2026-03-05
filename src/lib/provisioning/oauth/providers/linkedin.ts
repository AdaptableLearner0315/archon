/**
 * LinkedIn OAuth Provider
 * Handles LinkedIn OAuth 2.0 for company page posting
 */

import type { RefreshedTokens, ProviderAccountInfo } from '../types';

const LINKEDIN_API_BASE = 'https://api.linkedin.com/v2';

/**
 * Get LinkedIn profile info
 */
export async function getAccountInfo(
  accessToken: string
): Promise<ProviderAccountInfo | null> {
  try {
    // Get profile
    const profileResponse = await fetch(
      `${LINKEDIN_API_BASE}/me?projection=(id,firstName,lastName,profilePicture(displayImage~:playableStreams))`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!profileResponse.ok) {
      return null;
    }

    const profile = await profileResponse.json();

    const firstName = profile.firstName?.localized?.en_US || '';
    const lastName = profile.lastName?.localized?.en_US || '';
    const avatar = profile.profilePicture?.['displayImage~']?.elements?.[0]?.identifiers?.[0]?.identifier;

    return {
      id: profile.id,
      name: `${firstName} ${lastName}`.trim() || 'LinkedIn User',
      avatar,
    };
  } catch (error) {
    console.error('Failed to get LinkedIn profile info:', error);
    return null;
  }
}

/**
 * Refresh LinkedIn access token
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<RefreshedTokens | null> {
  try {
    const response = await fetch(`${LINKEDIN_API_BASE}/../oauth/v2/accessToken`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: process.env.LINKEDIN_CLIENT_ID || '',
        client_secret: process.env.LINKEDIN_CLIENT_SECRET || '',
      }).toString(),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('LinkedIn token refresh failed:', errorData);
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
    console.error('Failed to refresh LinkedIn token:', error);
    return null;
  }
}

/**
 * Get organization pages the user can post to
 */
export async function getOrganizations(
  accessToken: string
): Promise<Array<{ id: string; name: string }>> {
  try {
    const response = await fetch(
      `${LINKEDIN_API_BASE}/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(id,localizedName)))`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return (data.elements || []).map((el: {
      'organization~': { id: string; localizedName: string };
    }) => ({
      id: el['organization~'].id,
      name: el['organization~'].localizedName,
    }));
  } catch (error) {
    console.error('Failed to get LinkedIn organizations:', error);
    return [];
  }
}

/**
 * Post to a LinkedIn company page
 */
export async function postToOrganization(
  accessToken: string,
  organizationId: string,
  text: string,
  articleUrl?: string
): Promise<{ id: string } | null> {
  try {
    const author = `urn:li:organization:${organizationId}`;

    const postBody: {
      author: string;
      lifecycleState: string;
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: string };
          shareMediaCategory: string;
          media?: Array<{
            status: string;
            originalUrl: string;
          }>;
        };
      };
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': string;
      };
    } = {
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: articleUrl ? 'ARTICLE' : 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    };

    if (articleUrl) {
      postBody.specificContent['com.linkedin.ugc.ShareContent'].media = [
        {
          status: 'READY',
          originalUrl: articleUrl,
        },
      ];
    }

    const response = await fetch(`${LINKEDIN_API_BASE}/ugcPosts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(postBody),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('LinkedIn post failed:', errorData);
      return null;
    }

    const postId = response.headers.get('X-RestLi-Id') || response.headers.get('x-restli-id');
    return postId ? { id: postId } : null;
  } catch (error) {
    console.error('Failed to post to LinkedIn:', error);
    return null;
  }
}

/**
 * Delete a LinkedIn post
 */
export async function deletePost(
  accessToken: string,
  postId: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `${LINKEDIN_API_BASE}/ugcPosts/${encodeURIComponent(postId)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      }
    );

    return response.ok;
  } catch (error) {
    console.error('Failed to delete LinkedIn post:', error);
    return false;
  }
}

/**
 * Update organization description/tagline
 * Note: Requires r_organization_admin and w_organization_admin scopes
 */
export async function updateOrganizationDescription(
  accessToken: string,
  organizationId: string,
  description: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `${LINKEDIN_API_BASE}/organizations/${organizationId}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
          'X-HTTP-Method-Override': 'PATCH',
        },
        body: JSON.stringify({
          description: {
            localized: {
              en_US: description,
            },
            preferredLocale: {
              country: 'US',
              language: 'en',
            },
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Organization update failed:', errorData);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to update organization description:', error);
    return false;
  }
}

/**
 * Post to personal profile (not organization)
 */
export async function postToProfile(
  accessToken: string,
  personId: string,
  text: string,
  articleUrl?: string
): Promise<{ id: string } | null> {
  try {
    const author = `urn:li:person:${personId}`;

    const postBody: {
      author: string;
      lifecycleState: string;
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: string };
          shareMediaCategory: string;
          media?: Array<{
            status: string;
            originalUrl: string;
          }>;
        };
      };
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': string;
      };
    } = {
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: articleUrl ? 'ARTICLE' : 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    };

    if (articleUrl) {
      postBody.specificContent['com.linkedin.ugc.ShareContent'].media = [
        {
          status: 'READY',
          originalUrl: articleUrl,
        },
      ];
    }

    const response = await fetch(`${LINKEDIN_API_BASE}/ugcPosts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(postBody),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('LinkedIn profile post failed:', errorData);
      return null;
    }

    const postId = response.headers.get('X-RestLi-Id') || response.headers.get('x-restli-id');
    return postId ? { id: postId } : null;
  } catch (error) {
    console.error('Failed to post to LinkedIn profile:', error);
    return null;
  }
}

/**
 * Social Media Deployer
 * Unified post execution engine for all social platforms
 */

import { createClient } from '@/lib/supabase/server';
import { getValidTokens } from '../tokens';
import type { SocialPlatform, ScheduledPost } from '../types';
import type { SocialContent } from '@/lib/infrastructure/types';

// Import platform-specific posting functions
import * as twitter from '../oauth/providers/twitter';
import * as linkedin from '../oauth/providers/linkedin';
import * as youtube from '../oauth/providers/youtube';
import * as tiktok from '../oauth/providers/tiktok';

export interface PostResult {
  success: boolean;
  postId?: string;
  externalPostId?: string;
  error?: string;
  rateLimited?: boolean;
  retryAfter?: number;
}

export interface PostOptions {
  mediaUrls?: string[];
  articleUrl?: string;
  replyToId?: string;
  isThread?: boolean;
  threadContent?: string[];
}

export interface VideoOptions {
  title: string;
  description?: string;
  tags?: string[];
  privacy?: 'public' | 'unlisted' | 'private';
}

export interface ProfileSetupResult {
  success: boolean;
  setupType: 'bio' | 'pinned' | 'header';
  externalId?: string;
  error?: string;
}

/**
 * Execute a scheduled post from the database
 */
export async function executeScheduledPost(postId: string): Promise<PostResult> {
  const supabase = await createClient();

  // Get the scheduled post
  const { data: post, error: fetchError } = await supabase
    .from('scheduled_posts')
    .select('*')
    .eq('id', postId)
    .single();

  if (fetchError || !post) {
    return { success: false, error: 'Post not found' };
  }

  // Mark as posting
  await supabase
    .from('scheduled_posts')
    .update({ status: 'posting', updated_at: new Date().toISOString() })
    .eq('id', postId);

  try {
    const platform = post.platform as SocialPlatform;
    const options: PostOptions = {
      mediaUrls: post.media_urls || [],
      ...(post.metadata as PostOptions),
    };

    let result: PostResult;

    switch (platform) {
      case 'twitter':
        result = await postToTwitter(post.company_id, post.content, options);
        break;
      case 'linkedin':
        result = await postToLinkedIn(post.company_id, post.content, options);
        break;
      case 'youtube':
        result = await postToYouTube(post.company_id, post.content, options as VideoOptions);
        break;
      case 'tiktok':
        result = await postToTikTok(
          post.company_id,
          options.mediaUrls?.[0] || '',
          post.content
        );
        break;
      default:
        result = { success: false, error: `Unsupported platform: ${platform}` };
    }

    // Update post status based on result
    if (result.success) {
      await supabase
        .from('scheduled_posts')
        .update({
          status: 'posted',
          external_post_id: result.externalPostId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', postId);
    } else {
      const scheduledPost = post as ScheduledPost & { retry_count?: number; max_retries?: number };
      const retryCount = (scheduledPost.retry_count || 0) + 1;
      const maxRetries = scheduledPost.max_retries || 3;

      await supabase
        .from('scheduled_posts')
        .update({
          status: retryCount >= maxRetries ? 'failed' : 'scheduled',
          error: result.error,
          retry_count: retryCount,
          last_retry_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', postId);
    }

    return { ...result, postId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await supabase
      .from('scheduled_posts')
      .update({
        status: 'failed',
        error: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', postId);

    return { success: false, postId, error: errorMessage };
  }
}

/**
 * Post to Twitter
 */
export async function postToTwitter(
  companyId: string,
  content: string,
  options?: PostOptions
): Promise<PostResult> {
  const tokens = await getValidTokens(companyId, 'twitter');
  if (!tokens) {
    return { success: false, error: 'Twitter not connected or tokens expired' };
  }

  try {
    // Handle thread posting
    if (options?.isThread && options.threadContent?.length) {
      const threadResults = await twitter.postThread(tokens.accessToken, options.threadContent);
      if (threadResults && threadResults.length > 0) {
        return {
          success: true,
          externalPostId: threadResults[0].id,
        };
      }
      return { success: false, error: 'Thread posting failed' };
    }

    // Single tweet
    const result = await twitter.postTweet(tokens.accessToken, content, options?.replyToId);
    if (result) {
      return {
        success: true,
        externalPostId: result.id,
      };
    }

    return { success: false, error: 'Tweet posting failed' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown Twitter error';

    // Check for rate limiting
    if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
      return {
        success: false,
        error: 'Twitter rate limit exceeded',
        rateLimited: true,
        retryAfter: 900, // 15 minutes
      };
    }

    return { success: false, error: errorMessage };
  }
}

/**
 * Post to LinkedIn
 */
export async function postToLinkedIn(
  companyId: string,
  content: string,
  options?: PostOptions
): Promise<PostResult> {
  const tokens = await getValidTokens(companyId, 'linkedin');
  if (!tokens) {
    return { success: false, error: 'LinkedIn not connected or tokens expired' };
  }

  const supabase = await createClient();

  // Get LinkedIn organization ID from connected account metadata
  const { data: account } = await supabase
    .from('connected_accounts')
    .select('metadata, provider_account_id')
    .eq('company_id', companyId)
    .eq('provider', 'linkedin')
    .single();

  const organizationId = (account?.metadata as { organizationId?: string })?.organizationId
    || account?.provider_account_id;

  if (!organizationId) {
    // Fall back to posting to personal profile
    const { data: profile } = await supabase
      .from('connected_accounts')
      .select('provider_account_id')
      .eq('company_id', companyId)
      .eq('provider', 'linkedin')
      .single();

    if (profile?.provider_account_id) {
      const result = await linkedin.postToProfile(
        tokens.accessToken,
        profile.provider_account_id,
        content,
        options?.articleUrl
      );

      if (result) {
        return { success: true, externalPostId: result.id };
      }
    }

    return { success: false, error: 'No LinkedIn organization or profile configured' };
  }

  try {
    const result = await linkedin.postToOrganization(
      tokens.accessToken,
      organizationId,
      content,
      options?.articleUrl
    );

    if (result) {
      return { success: true, externalPostId: result.id };
    }

    return { success: false, error: 'LinkedIn post failed' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown LinkedIn error';
    return { success: false, error: errorMessage };
  }
}

/**
 * Post to YouTube (community post or video)
 */
export async function postToYouTube(
  companyId: string,
  content: string,
  options?: VideoOptions
): Promise<PostResult> {
  const tokens = await getValidTokens(companyId, 'youtube');
  if (!tokens) {
    return { success: false, error: 'YouTube not connected or tokens expired' };
  }

  const supabase = await createClient();

  // Get channel ID
  const { data: account } = await supabase
    .from('connected_accounts')
    .select('provider_account_id')
    .eq('company_id', companyId)
    .eq('provider', 'youtube')
    .single();

  const channelId = account?.provider_account_id;
  if (!channelId) {
    return { success: false, error: 'YouTube channel not configured' };
  }

  try {
    // For text content, create community post
    const result = await youtube.createCommunityPost(tokens.accessToken, channelId, content);

    if (result) {
      return { success: true, externalPostId: result.id };
    }

    return { success: false, error: 'YouTube post failed' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown YouTube error';
    return { success: false, error: errorMessage };
  }
}

/**
 * Upload video to YouTube
 */
export async function uploadYouTubeVideo(
  companyId: string,
  videoUrl: string,
  metadata: VideoOptions
): Promise<PostResult> {
  const tokens = await getValidTokens(companyId, 'youtube');
  if (!tokens) {
    return { success: false, error: 'YouTube not connected or tokens expired' };
  }

  try {
    const result = await youtube.uploadVideoFromUrl(tokens.accessToken, videoUrl, {
      title: metadata.title,
      description: metadata.description,
      tags: metadata.tags,
      privacyStatus: metadata.privacy,
    });

    if (result) {
      return { success: true, externalPostId: result.id };
    }

    return { success: false, error: 'YouTube video upload failed' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown YouTube error';
    return { success: false, error: errorMessage };
  }
}

/**
 * Post to TikTok (video only)
 */
export async function postToTikTok(
  companyId: string,
  videoUrl: string,
  caption: string
): Promise<PostResult> {
  if (!videoUrl) {
    return { success: false, error: 'TikTok requires a video URL' };
  }

  const tokens = await getValidTokens(companyId, 'tiktok');
  if (!tokens) {
    return { success: false, error: 'TikTok not connected or tokens expired' };
  }

  try {
    const result = await tiktok.postVideoFromUrl(tokens.accessToken, videoUrl, caption);

    if (result) {
      return { success: true, externalPostId: result.id };
    }

    return { success: false, error: 'TikTok video post failed' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown TikTok error';
    return { success: false, error: errorMessage };
  }
}

/**
 * Setup social media profile from generated content
 */
export async function setupProfile(
  companyId: string,
  platform: 'twitter' | 'linkedin',
  content: SocialContent
): Promise<ProfileSetupResult[]> {
  const results: ProfileSetupResult[] = [];
  const supabase = await createClient();

  if (platform === 'twitter') {
    const tokens = await getValidTokens(companyId, 'twitter');
    if (!tokens) {
      return [{ success: false, setupType: 'bio', error: 'Twitter not connected' }];
    }

    // Update bio
    try {
      const bioResult = await twitter.updateProfile(tokens.accessToken, {
        description: content.twitter.bio,
      });

      await supabase.from('social_profile_setups').upsert({
        company_id: companyId,
        platform: 'twitter',
        setup_type: 'bio',
        content: content.twitter.bio,
        status: bioResult ? 'completed' : 'failed',
        completed_at: bioResult ? new Date().toISOString() : null,
      });

      results.push({
        success: bioResult,
        setupType: 'bio',
        error: bioResult ? undefined : 'Bio update failed',
      });
    } catch (error) {
      results.push({
        success: false,
        setupType: 'bio',
        error: error instanceof Error ? error.message : 'Bio update error',
      });
    }

    // Post and pin the pinned tweet
    try {
      const pinnedTweetResult = await twitter.postTweet(
        tokens.accessToken,
        content.twitter.pinnedTweet
      );

      if (pinnedTweetResult) {
        // Get user ID for pinning
        const accountInfo = await twitter.getAccountInfo(tokens.accessToken);
        if (accountInfo) {
          await twitter.pinTweet(tokens.accessToken, accountInfo.id, pinnedTweetResult.id);
        }

        await supabase.from('social_profile_setups').upsert({
          company_id: companyId,
          platform: 'twitter',
          setup_type: 'pinned',
          content: content.twitter.pinnedTweet,
          status: 'completed',
          external_id: pinnedTweetResult.id,
          completed_at: new Date().toISOString(),
        });

        results.push({
          success: true,
          setupType: 'pinned',
          externalId: pinnedTweetResult.id,
        });
      } else {
        results.push({
          success: false,
          setupType: 'pinned',
          error: 'Pinned tweet creation failed',
        });
      }
    } catch (error) {
      results.push({
        success: false,
        setupType: 'pinned',
        error: error instanceof Error ? error.message : 'Pinned tweet error',
      });
    }
  }

  if (platform === 'linkedin' && content.linkedin) {
    const tokens = await getValidTokens(companyId, 'linkedin');
    if (!tokens) {
      return [{ success: false, setupType: 'bio', error: 'LinkedIn not connected' }];
    }

    // Get organization ID
    const { data: account } = await supabase
      .from('connected_accounts')
      .select('metadata, provider_account_id')
      .eq('company_id', companyId)
      .eq('provider', 'linkedin')
      .single();

    const organizationId = (account?.metadata as { organizationId?: string })?.organizationId
      || account?.provider_account_id;

    if (organizationId) {
      try {
        const bioResult = await linkedin.updateOrganizationDescription(
          tokens.accessToken,
          organizationId,
          content.linkedin.bio
        );

        await supabase.from('social_profile_setups').upsert({
          company_id: companyId,
          platform: 'linkedin',
          setup_type: 'bio',
          content: content.linkedin.bio,
          status: bioResult ? 'completed' : 'failed',
          completed_at: bioResult ? new Date().toISOString() : null,
        });

        results.push({
          success: bioResult,
          setupType: 'bio',
          error: bioResult ? undefined : 'LinkedIn bio update failed',
        });
      } catch (error) {
        results.push({
          success: false,
          setupType: 'bio',
          error: error instanceof Error ? error.message : 'LinkedIn bio error',
        });
      }
    }
  }

  return results;
}

/**
 * Get connected platforms for a company
 */
export async function getConnectedPlatforms(
  companyId: string
): Promise<SocialPlatform[]> {
  const supabase = await createClient();

  const { data: accounts } = await supabase
    .from('connected_accounts')
    .select('provider')
    .eq('company_id', companyId)
    .eq('status', 'active')
    .in('provider', ['twitter', 'linkedin', 'youtube', 'tiktok']);

  if (!accounts) return [];

  return accounts.map((a) => a.provider as SocialPlatform);
}

/**
 * Post to all connected platforms
 */
export async function postToAllPlatforms(
  companyId: string,
  content: string,
  options?: PostOptions
): Promise<Record<SocialPlatform, PostResult>> {
  const platforms = await getConnectedPlatforms(companyId);
  const results: Record<string, PostResult> = {};

  for (const platform of platforms) {
    switch (platform) {
      case 'twitter':
        results.twitter = await postToTwitter(companyId, content, options);
        break;
      case 'linkedin':
        results.linkedin = await postToLinkedIn(companyId, content, options);
        break;
      case 'youtube':
        // YouTube requires video for regular posts, skip text-only
        results.youtube = { success: false, error: 'YouTube requires video content' };
        break;
      case 'tiktok':
        // TikTok requires video
        results.tiktok = { success: false, error: 'TikTok requires video content' };
        break;
    }
  }

  return results as Record<SocialPlatform, PostResult>;
}

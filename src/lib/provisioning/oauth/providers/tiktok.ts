/**
 * TikTok OAuth Provider
 * Handles TikTok Content Posting API for video uploads
 */

import type { RefreshedTokens, ProviderAccountInfo } from '../types';

const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2';

/**
 * Get TikTok account info
 */
export async function getAccountInfo(
  accessToken: string
): Promise<ProviderAccountInfo | null> {
  try {
    const response = await fetch(
      `${TIKTOK_API_BASE}/user/info/?fields=open_id,union_id,avatar_url,display_name`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    const { data } = await response.json();
    const user = data?.user;

    if (!user) {
      return null;
    }

    return {
      id: user.open_id,
      name: user.display_name || 'TikTok User',
      avatar: user.avatar_url,
    };
  } catch (error) {
    console.error('Failed to get TikTok account info:', error);
    return null;
  }
}

/**
 * Refresh TikTok access token
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<RefreshedTokens | null> {
  try {
    const response = await fetch(
      'https://open.tiktokapis.com/v2/oauth/token/',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_key: process.env.TIKTOK_CLIENT_KEY || '',
          client_secret: process.env.TIKTOK_CLIENT_SECRET || '',
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }).toString(),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('TikTok token refresh failed:', errorData);
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
    console.error('Failed to refresh TikTok token:', error);
    return null;
  }
}

/**
 * Initialize video upload to TikTok
 * Returns upload URL for posting video
 */
export async function initializeVideoUpload(
  accessToken: string,
  videoSize: number
): Promise<{
  uploadUrl: string;
  publishId: string;
} | null> {
  try {
    const response = await fetch(
      `${TIKTOK_API_BASE}/post/publish/video/init/`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          post_info: {
            title: '', // Will be set in caption
            privacy_level: 'PUBLIC_TO_EVERYONE',
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
          },
          source_info: {
            source: 'FILE_UPLOAD',
            video_size: videoSize,
            chunk_size: videoSize, // Single chunk upload
            total_chunk_count: 1,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('TikTok video init failed:', errorData);
      return null;
    }

    const { data } = await response.json();
    return {
      uploadUrl: data.upload_url,
      publishId: data.publish_id,
    };
  } catch (error) {
    console.error('Failed to initialize TikTok video upload:', error);
    return null;
  }
}

/**
 * Upload video buffer to TikTok
 */
export async function uploadVideoChunk(
  uploadUrl: string,
  videoBuffer: Buffer
): Promise<boolean> {
  try {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Range': `bytes 0-${videoBuffer.length - 1}/${videoBuffer.length}`,
      },
      body: new Uint8Array(videoBuffer),
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to upload TikTok video chunk:', error);
    return false;
  }
}

/**
 * Check video upload status
 */
export async function checkUploadStatus(
  accessToken: string,
  publishId: string
): Promise<'processing' | 'published' | 'failed'> {
  try {
    const response = await fetch(
      `${TIKTOK_API_BASE}/post/publish/status/fetch/`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ publish_id: publishId }),
      }
    );

    if (!response.ok) {
      return 'failed';
    }

    const { data } = await response.json();
    const status = data?.status;

    if (status === 'PUBLISH_COMPLETE') return 'published';
    if (status === 'FAILED') return 'failed';
    return 'processing';
  } catch (error) {
    console.error('Failed to check TikTok upload status:', error);
    return 'failed';
  }
}

/**
 * Upload video to TikTok from URL
 * Fetches video and uploads to TikTok
 */
export async function uploadVideoFromUrl(
  accessToken: string,
  videoUrl: string,
  caption: string
): Promise<{ id: string } | null> {
  try {
    // Fetch video from URL
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      console.error('Failed to fetch video from URL:', videoUrl);
      return null;
    }

    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
    return uploadVideo(accessToken, videoBuffer, caption);
  } catch (error) {
    console.error('Failed to upload TikTok video from URL:', error);
    return null;
  }
}

/**
 * Upload video buffer to TikTok
 */
export async function uploadVideo(
  accessToken: string,
  videoBuffer: Buffer,
  caption: string
): Promise<{ id: string } | null> {
  try {
    // Step 1: Initialize upload
    const initResult = await initializeVideoUpload(accessToken, videoBuffer.length);
    if (!initResult) {
      return null;
    }

    // Step 2: Upload video chunk
    const uploadSuccess = await uploadVideoChunk(initResult.uploadUrl, videoBuffer);
    if (!uploadSuccess) {
      console.error('Video chunk upload failed');
      return null;
    }

    // Step 3: Wait for processing (poll with timeout)
    const maxWaitMs = 60000; // 60 seconds
    const pollInterval = 3000; // 3 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const status = await checkUploadStatus(accessToken, initResult.publishId);

      if (status === 'published') {
        return { id: initResult.publishId };
      }

      if (status === 'failed') {
        console.error('TikTok video processing failed');
        return null;
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    // Return with publish ID even if still processing
    // The video might complete after timeout
    console.warn('TikTok video still processing after timeout');
    return { id: initResult.publishId };
  } catch (error) {
    console.error('Failed to upload TikTok video:', error);
    return null;
  }
}

/**
 * Post video to TikTok using direct post API (for pre-hosted videos)
 * Alternative to file upload - uses URL-based posting
 */
export async function postVideoFromUrl(
  accessToken: string,
  videoUrl: string,
  caption: string
): Promise<{ id: string } | null> {
  try {
    const response = await fetch(
      `${TIKTOK_API_BASE}/post/publish/video/init/`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          post_info: {
            title: caption.substring(0, 150), // TikTok caption limit
            privacy_level: 'PUBLIC_TO_EVERYONE',
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
          },
          source_info: {
            source: 'PULL_FROM_URL',
            video_url: videoUrl,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('TikTok URL post failed:', errorData);
      return null;
    }

    const { data } = await response.json();
    return { id: data.publish_id };
  } catch (error) {
    console.error('Failed to post TikTok video from URL:', error);
    return null;
  }
}

/**
 * Social Media Scheduler
 * Schedules posts from content calendars and processes due posts
 */

import { createClient } from '@/lib/supabase/server';
import { executeScheduledPost } from './deployers/social-deployer';
import type { SocialPlatform, ScheduledPost } from './types';
import type { SocialContent } from '@/lib/infrastructure/types';

interface ContentCalendarItem {
  day: number;
  content: string;
  type: 'thread' | 'single' | 'reply' | 'quote';
  hashtags: string[];
  bestTime: string;
}

interface ScheduleResult {
  scheduled: number;
  skipped: number;
  errors: string[];
}

interface ProcessResult {
  processed: number;
  succeeded: number;
  failed: number;
  rateLimited: number;
}

/**
 * Parse time string like "9:00 AM EST" to hours and minutes
 */
function parseTime(timeString: string): { hours: number; minutes: number } {
  const match = timeString.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) {
    return { hours: 10, minutes: 0 }; // Default to 10 AM
  }

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3]?.toUpperCase();

  if (period === 'PM' && hours !== 12) {
    hours += 12;
  } else if (period === 'AM' && hours === 12) {
    hours = 0;
  }

  return { hours, minutes };
}

/**
 * Schedule content calendar items to scheduled_posts table
 */
export async function scheduleContentCalendar(
  companyId: string,
  calendar: ContentCalendarItem[],
  platform: SocialPlatform = 'twitter',
  startDate?: Date
): Promise<ScheduleResult> {
  const supabase = await createClient();
  const result: ScheduleResult = { scheduled: 0, skipped: 0, errors: [] };

  const baseDate = startDate || new Date();
  baseDate.setHours(0, 0, 0, 0);

  for (const item of calendar) {
    try {
      // Calculate scheduled date based on day number
      const scheduledDate = new Date(baseDate);
      scheduledDate.setDate(scheduledDate.getDate() + (item.day - 1));

      // Set time from bestTime
      const { hours, minutes } = parseTime(item.bestTime);
      scheduledDate.setHours(hours, minutes, 0, 0);

      // Skip if scheduled time is in the past
      if (scheduledDate < new Date()) {
        result.skipped++;
        continue;
      }

      // Append hashtags to content
      const hashtags = item.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
      const fullContent = `${item.content}\n\n${hashtags}`.trim();

      // Check for duplicate (same company, platform, and similar scheduled time)
      const windowStart = new Date(scheduledDate);
      windowStart.setMinutes(windowStart.getMinutes() - 30);
      const windowEnd = new Date(scheduledDate);
      windowEnd.setMinutes(windowEnd.getMinutes() + 30);

      const { data: existing } = await supabase
        .from('scheduled_posts')
        .select('id')
        .eq('company_id', companyId)
        .eq('platform', platform)
        .gte('scheduled_for', windowStart.toISOString())
        .lte('scheduled_for', windowEnd.toISOString())
        .in('status', ['scheduled', 'posting'])
        .limit(1);

      if (existing && existing.length > 0) {
        result.skipped++;
        continue;
      }

      // Insert scheduled post
      const { error: insertError } = await supabase.from('scheduled_posts').insert({
        company_id: companyId,
        platform,
        content: fullContent,
        scheduled_for: scheduledDate.toISOString(),
        status: 'scheduled',
        post_type: item.type,
        source: 'calendar',
        metadata: {
          day: item.day,
          type: item.type,
          originalContent: item.content,
          hashtags: item.hashtags,
          isThread: item.type === 'thread',
        },
      });

      if (insertError) {
        result.errors.push(`Day ${item.day}: ${insertError.message}`);
      } else {
        result.scheduled++;
      }
    } catch (error) {
      result.errors.push(
        `Day ${item.day}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  return result;
}

/**
 * Schedule all social content from generated infrastructure
 */
export async function scheduleAllSocialContent(
  companyId: string,
  content: SocialContent,
  startDate?: Date
): Promise<Record<SocialPlatform, ScheduleResult>> {
  const results: Record<string, ScheduleResult> = {};

  // Schedule Twitter content
  if (content.twitter?.contentCalendar) {
    results.twitter = await scheduleContentCalendar(
      companyId,
      content.twitter.contentCalendar,
      'twitter',
      startDate
    );
  }

  // LinkedIn doesn't have a daily calendar in current schema
  // but we can schedule content ideas as posts if needed
  if (content.linkedin?.contentIdeas) {
    // Convert content ideas to a simple calendar
    const linkedInCalendar: ContentCalendarItem[] = content.linkedin.contentIdeas.map(
      (idea, index) => ({
        day: index + 1,
        content: idea,
        type: 'single' as const,
        hashtags: [],
        bestTime: '10:00 AM EST',
      })
    );

    results.linkedin = await scheduleContentCalendar(
      companyId,
      linkedInCalendar,
      'linkedin',
      startDate
    );
  }

  return results as Record<SocialPlatform, ScheduleResult>;
}

/**
 * Process all posts that are due for posting
 */
export async function processDuePosts(): Promise<ProcessResult> {
  const supabase = await createClient();
  const result: ProcessResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    rateLimited: 0,
  };

  // Get posts due for posting (scheduled time has passed)
  const { data: duePosts, error: fetchError } = await supabase
    .from('scheduled_posts')
    .select('id, company_id, platform')
    .eq('status', 'scheduled')
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(50); // Process in batches

  if (fetchError || !duePosts) {
    console.error('Failed to fetch due posts:', fetchError);
    return result;
  }

  for (const post of duePosts) {
    result.processed++;

    try {
      const postResult = await executeScheduledPost(post.id);

      if (postResult.success) {
        result.succeeded++;
      } else if (postResult.rateLimited) {
        result.rateLimited++;
        // Reschedule rate-limited posts
        const retryTime = new Date();
        retryTime.setSeconds(retryTime.getSeconds() + (postResult.retryAfter || 900));

        await supabase
          .from('scheduled_posts')
          .update({
            status: 'scheduled',
            scheduled_for: retryTime.toISOString(),
            error: 'Rate limited - rescheduled',
          })
          .eq('id', post.id);
      } else {
        result.failed++;
      }
    } catch (error) {
      result.failed++;
      console.error(`Failed to process post ${post.id}:`, error);
    }
  }

  return result;
}

/**
 * Retry failed posts that haven't exceeded max retries
 */
export async function retryFailedPosts(): Promise<{ retried: number; skipped: number }> {
  const supabase = await createClient();
  const result = { retried: 0, skipped: 0 };

  // Get failed posts that can be retried
  const { data: failedPosts, error: fetchError } = await supabase
    .from('scheduled_posts')
    .select('id, retry_count, max_retries')
    .eq('status', 'failed')
    .order('last_retry_at', { ascending: true, nullsFirst: true })
    .limit(20);

  if (fetchError || !failedPosts) {
    return result;
  }

  for (const post of failedPosts) {
    const retryCount = (post as ScheduledPost & { retry_count?: number }).retry_count || 0;
    const maxRetries = (post as ScheduledPost & { max_retries?: number }).max_retries || 3;

    if (retryCount >= maxRetries) {
      result.skipped++;
      continue;
    }

    // Reset to scheduled for retry
    await supabase
      .from('scheduled_posts')
      .update({
        status: 'scheduled',
        scheduled_for: new Date().toISOString(),
      })
      .eq('id', post.id);

    result.retried++;
  }

  return result;
}

/**
 * Get upcoming scheduled posts for a company
 */
export async function getUpcomingPosts(
  companyId: string,
  limit = 10
): Promise<ScheduledPost[]> {
  const supabase = await createClient();

  const { data: posts } = await supabase
    .from('scheduled_posts')
    .select('*')
    .eq('company_id', companyId)
    .eq('status', 'scheduled')
    .gte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(limit);

  return (posts as ScheduledPost[]) || [];
}

/**
 * Get post history for a company
 */
export async function getPostHistory(
  companyId: string,
  options?: {
    platform?: SocialPlatform;
    status?: ScheduledPost['status'];
    limit?: number;
    offset?: number;
  }
): Promise<{ posts: ScheduledPost[]; total: number }> {
  const supabase = await createClient();

  let query = supabase
    .from('scheduled_posts')
    .select('*', { count: 'exact' })
    .eq('company_id', companyId)
    .order('scheduled_for', { ascending: false });

  if (options?.platform) {
    query = query.eq('platform', options.platform);
  }

  if (options?.status) {
    query = query.eq('status', options.status);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
  }

  const { data: posts, count } = await query;

  return {
    posts: (posts as ScheduledPost[]) || [],
    total: count || 0,
  };
}

/**
 * Cancel a scheduled post
 */
export async function cancelScheduledPost(postId: string): Promise<boolean> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('scheduled_posts')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', postId)
    .eq('status', 'scheduled');

  return !error;
}

/**
 * Reschedule a post to a new time
 */
export async function reschedulePost(
  postId: string,
  newScheduledTime: Date
): Promise<boolean> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('scheduled_posts')
    .update({
      scheduled_for: newScheduledTime.toISOString(),
      status: 'scheduled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', postId)
    .in('status', ['scheduled', 'failed', 'cancelled']);

  return !error;
}

/**
 * Get scheduling statistics for a company
 */
export async function getSchedulingStats(companyId: string): Promise<{
  total: number;
  scheduled: number;
  posted: number;
  failed: number;
  cancelled: number;
  byPlatform: Record<SocialPlatform, number>;
}> {
  const supabase = await createClient();

  const { data: posts } = await supabase
    .from('scheduled_posts')
    .select('status, platform')
    .eq('company_id', companyId);

  if (!posts) {
    return {
      total: 0,
      scheduled: 0,
      posted: 0,
      failed: 0,
      cancelled: 0,
      byPlatform: {} as Record<SocialPlatform, number>,
    };
  }

  const stats = {
    total: posts.length,
    scheduled: 0,
    posted: 0,
    failed: 0,
    cancelled: 0,
    byPlatform: {} as Record<SocialPlatform, number>,
  };

  for (const post of posts) {
    // Count by status
    if (post.status === 'scheduled' || post.status === 'posting') stats.scheduled++;
    else if (post.status === 'posted') stats.posted++;
    else if (post.status === 'failed') stats.failed++;
    else if (post.status === 'cancelled') stats.cancelled++;

    // Count by platform
    const platform = post.platform as SocialPlatform;
    stats.byPlatform[platform] = (stats.byPlatform[platform] || 0) + 1;
  }

  return stats;
}

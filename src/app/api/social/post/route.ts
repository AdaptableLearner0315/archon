/**
 * Social Post Management API
 * Handles scheduling, listing, and managing social media posts
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getUpcomingPosts,
  getPostHistory,
  cancelScheduledPost,
  reschedulePost,
  getSchedulingStats,
} from '@/lib/provisioning/social-scheduler';
import {
  executeScheduledPost,
  postToTwitter,
  postToLinkedIn,
} from '@/lib/provisioning/deployers/social-deployer';
import type { SocialPlatform } from '@/lib/provisioning/types';

/**
 * GET /api/social/post
 * List scheduled posts for a company
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('companyId');
  const view = searchParams.get('view') || 'upcoming'; // 'upcoming' | 'history' | 'stats'
  const platform = searchParams.get('platform') as SocialPlatform | null;
  const status = searchParams.get('status') as 'scheduled' | 'posted' | 'failed' | 'cancelled' | null;
  const limit = parseInt(searchParams.get('limit') || '10', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  if (!companyId) {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 });
  }

  // Verify user owns this company
  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .eq('user_id', user.id)
    .single();

  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  try {
    if (view === 'stats') {
      const stats = await getSchedulingStats(companyId);
      return NextResponse.json({ stats });
    }

    if (view === 'upcoming') {
      const posts = await getUpcomingPosts(companyId, limit);
      return NextResponse.json({ posts });
    }

    // History view
    const { posts, total } = await getPostHistory(companyId, {
      platform: platform || undefined,
      status: status || undefined,
      limit,
      offset,
    });

    return NextResponse.json({
      posts,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + posts.length < total,
      },
    });
  } catch (error) {
    console.error('Failed to get posts:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve posts' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/social/post
 * Schedule a new post or post immediately
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      companyId,
      platform,
      content,
      scheduledFor,
      immediate = false,
      mediaUrls = [],
      metadata = {},
    } = body;

    if (!companyId || !platform || !content) {
      return NextResponse.json(
        { error: 'companyId, platform, and content are required' },
        { status: 400 }
      );
    }

    // Verify user owns this company
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .eq('user_id', user.id)
      .single();

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // If immediate, post right away
    if (immediate) {
      let result;
      if (platform === 'twitter') {
        result = await postToTwitter(companyId, content, { mediaUrls });
      } else if (platform === 'linkedin') {
        result = await postToLinkedIn(companyId, content, { mediaUrls });
      } else {
        return NextResponse.json(
          { error: `Immediate posting not supported for ${platform}` },
          { status: 400 }
        );
      }

      if (result.success) {
        // Log the post
        await supabase.from('scheduled_posts').insert({
          company_id: companyId,
          platform,
          content,
          media_urls: mediaUrls,
          scheduled_for: new Date().toISOString(),
          status: 'posted',
          external_post_id: result.externalPostId,
          source: 'manual',
          metadata,
        });

        return NextResponse.json({
          success: true,
          posted: true,
          externalPostId: result.externalPostId,
        });
      }

      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    // Schedule for later
    if (!scheduledFor) {
      return NextResponse.json(
        { error: 'scheduledFor is required for scheduled posts' },
        { status: 400 }
      );
    }

    const scheduledTime = new Date(scheduledFor);
    if (scheduledTime <= new Date()) {
      return NextResponse.json(
        { error: 'scheduledFor must be in the future' },
        { status: 400 }
      );
    }

    const { data: post, error: insertError } = await supabase
      .from('scheduled_posts')
      .insert({
        company_id: companyId,
        platform,
        content,
        media_urls: mediaUrls,
        scheduled_for: scheduledTime.toISOString(),
        status: 'scheduled',
        source: 'manual',
        metadata,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      scheduled: true,
      post,
    });
  } catch (error) {
    console.error('Failed to create post:', error);
    return NextResponse.json(
      { error: 'Failed to create post' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/social/post
 * Update a scheduled post (reschedule or cancel)
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { postId, action, scheduledFor, content } = body;

    if (!postId || !action) {
      return NextResponse.json(
        { error: 'postId and action are required' },
        { status: 400 }
      );
    }

    // Verify user owns this post's company
    const { data: post } = await supabase
      .from('scheduled_posts')
      .select('id, company_id, companies!inner(user_id)')
      .eq('id', postId)
      .single();

    const companiesData = post?.companies as { user_id: string } | { user_id: string }[] | null;
    const companyUserId = Array.isArray(companiesData) ? companiesData[0]?.user_id : companiesData?.user_id;

    if (!post || companyUserId !== user.id) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    if (action === 'cancel') {
      const success = await cancelScheduledPost(postId);
      return NextResponse.json({ success, action: 'cancelled' });
    }

    if (action === 'reschedule') {
      if (!scheduledFor) {
        return NextResponse.json(
          { error: 'scheduledFor required for reschedule' },
          { status: 400 }
        );
      }
      const success = await reschedulePost(postId, new Date(scheduledFor));
      return NextResponse.json({ success, action: 'rescheduled' });
    }

    if (action === 'update') {
      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (content) updates.content = content;
      if (scheduledFor) updates.scheduled_for = new Date(scheduledFor).toISOString();

      const { error: updateError } = await supabase
        .from('scheduled_posts')
        .update(updates)
        .eq('id', postId)
        .eq('status', 'scheduled');

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, action: 'updated' });
    }

    if (action === 'retry') {
      const result = await executeScheduledPost(postId);
      return NextResponse.json({
        success: result.success,
        action: 'retried',
        externalPostId: result.externalPostId,
        error: result.error,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Failed to update post:', error);
    return NextResponse.json(
      { error: 'Failed to update post' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/social/post
 * Delete a scheduled post
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const postId = searchParams.get('postId');

  if (!postId) {
    return NextResponse.json({ error: 'postId required' }, { status: 400 });
  }

  try {
    // Verify user owns this post's company
    const { data: post } = await supabase
      .from('scheduled_posts')
      .select('id, status, company_id, companies!inner(user_id)')
      .eq('id', postId)
      .single();

    const deleteCompaniesData = post?.companies as { user_id: string } | { user_id: string }[] | null;
    const deleteCompanyUserId = Array.isArray(deleteCompaniesData) ? deleteCompaniesData[0]?.user_id : deleteCompaniesData?.user_id;

    if (!post || deleteCompanyUserId !== user.id) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Only allow deleting scheduled or cancelled posts
    if (!['scheduled', 'cancelled', 'failed'].includes(post.status)) {
      return NextResponse.json(
        { error: 'Cannot delete posted content' },
        { status: 400 }
      );
    }

    const { error: deleteError } = await supabase
      .from('scheduled_posts')
      .delete()
      .eq('id', postId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deleted: true });
  } catch (error) {
    console.error('Failed to delete post:', error);
    return NextResponse.json(
      { error: 'Failed to delete post' },
      { status: 500 }
    );
  }
}

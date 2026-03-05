/**
 * Social Profile Setup API
 * Handles automated profile setup from generated content
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { setupProfile, getConnectedPlatforms } from '@/lib/provisioning/deployers/social-deployer';
import type { SocialContent } from '@/lib/infrastructure/types';

/**
 * GET /api/social/profile
 * Get profile setup status for a company
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('companyId');

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
    // Get profile setup status
    const { data: setups } = await supabase
      .from('social_profile_setups')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    // Get connected platforms
    const connectedPlatforms = await getConnectedPlatforms(companyId);

    // Group setups by platform
    const setupsByPlatform: Record<string, Array<{
      type: string;
      status: string;
      content: string | null;
      completedAt: string | null;
      error: string | null;
    }>> = {};

    for (const setup of setups || []) {
      if (!setupsByPlatform[setup.platform]) {
        setupsByPlatform[setup.platform] = [];
      }
      setupsByPlatform[setup.platform].push({
        type: setup.setup_type,
        status: setup.status,
        content: setup.content,
        completedAt: setup.completed_at,
        error: setup.error,
      });
    }

    return NextResponse.json({
      connectedPlatforms,
      setups: setupsByPlatform,
    });
  } catch (error) {
    console.error('Failed to get profile status:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve profile status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/social/profile
 * Setup profile from generated social content
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
      setupTypes = ['bio', 'pinned'],
    } = body as {
      companyId: string;
      platform: 'twitter' | 'linkedin';
      content?: SocialContent;
      setupTypes?: Array<'bio' | 'pinned' | 'header'>;
    };

    if (!companyId || !platform) {
      return NextResponse.json(
        { error: 'companyId and platform are required' },
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

    // Get content from infrastructure_assets if not provided
    let socialContent = content;
    if (!socialContent) {
      const { data: asset } = await supabase
        .from('infrastructure_assets')
        .select('content')
        .eq('company_id', companyId)
        .eq('asset_type', 'social')
        .single();

      if (asset?.content) {
        socialContent = asset.content as SocialContent;
      }
    }

    if (!socialContent) {
      return NextResponse.json(
        { error: 'No social content found. Generate infrastructure first.' },
        { status: 400 }
      );
    }

    // Mark setups as in_progress
    for (const setupType of setupTypes) {
      await supabase.from('social_profile_setups').upsert({
        company_id: companyId,
        platform,
        setup_type: setupType,
        status: 'in_progress',
        content: setupType === 'bio'
          ? (platform === 'twitter' ? socialContent.twitter.bio : socialContent.linkedin?.bio)
          : setupType === 'pinned'
            ? socialContent.twitter.pinnedTweet
            : null,
      });
    }

    // Execute profile setup
    const results = await setupProfile(companyId, platform, socialContent);

    return NextResponse.json({
      success: results.every((r) => r.success),
      results,
    });
  } catch (error) {
    console.error('Failed to setup profile:', error);
    return NextResponse.json(
      { error: 'Failed to setup profile' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/social/profile
 * Retry failed profile setup or update content
 */
export async function PATCH(request: NextRequest) {
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
      setupType,
      content,
      action = 'retry',
    } = body as {
      companyId: string;
      platform: 'twitter' | 'linkedin';
      setupType: 'bio' | 'pinned' | 'header';
      content?: string;
      action?: 'retry' | 'update';
    };

    if (!companyId || !platform || !setupType) {
      return NextResponse.json(
        { error: 'companyId, platform, and setupType are required' },
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

    if (action === 'update' && content) {
      // Update the content for this setup
      await supabase
        .from('social_profile_setups')
        .update({
          content,
          status: 'pending',
          error: null,
        })
        .eq('company_id', companyId)
        .eq('platform', platform)
        .eq('setup_type', setupType);
    }

    // Get the current content
    const { data: setup } = await supabase
      .from('social_profile_setups')
      .select('content')
      .eq('company_id', companyId)
      .eq('platform', platform)
      .eq('setup_type', setupType)
      .single();

    if (!setup?.content) {
      return NextResponse.json(
        { error: 'No content found for this setup' },
        { status: 400 }
      );
    }

    // Build minimal social content for the specific setup
    const socialContent: SocialContent = {
      twitter: {
        bio: setupType === 'bio' && platform === 'twitter' ? setup.content : '',
        pinnedTweet: setupType === 'pinned' ? setup.content : '',
        headerImagePrompt: '',
        contentCalendar: [],
        hashtagStrategy: [],
        competitorAccounts: [],
        growthTactics: [],
      },
      linkedin: platform === 'linkedin' ? {
        bio: setupType === 'bio' ? setup.content : '',
        headline: '',
        contentIdeas: [],
      } : undefined,
    };

    // Execute the specific setup
    const results = await setupProfile(companyId, platform, socialContent);
    const result = results.find((r) => r.setupType === setupType);

    return NextResponse.json({
      success: result?.success ?? false,
      result,
    });
  } catch (error) {
    console.error('Failed to retry profile setup:', error);
    return NextResponse.json(
      { error: 'Failed to retry profile setup' },
      { status: 500 }
    );
  }
}

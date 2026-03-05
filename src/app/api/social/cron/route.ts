/**
 * Social Media Cron Job
 * Processes scheduled posts every 15 minutes
 *
 * Called by Vercel cron: every 15 minutes
 */

import { NextRequest, NextResponse } from 'next/server';
import { processDuePosts, retryFailedPosts } from '@/lib/provisioning/social-scheduler';

export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds max

/**
 * Verify cron secret to prevent unauthorized access
 */
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // Allow in development without secret
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  if (!cronSecret) {
    console.warn('CRON_SECRET not configured');
    return false;
  }

  return authHeader === `Bearer ${cronSecret}`;
}

export async function POST(request: NextRequest) {
  // Verify authorization
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    // Process due posts
    const processResult = await processDuePosts();

    // Retry failed posts (only if we have capacity)
    let retryResult = { retried: 0, skipped: 0 };
    if (processResult.processed < 30) {
      retryResult = await retryFailedPosts();
    }

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      processed: {
        total: processResult.processed,
        succeeded: processResult.succeeded,
        failed: processResult.failed,
        rateLimited: processResult.rateLimited,
      },
      retries: {
        retried: retryResult.retried,
        skipped: retryResult.skipped,
      },
    });
  } catch (error) {
    console.error('Social cron job failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// GET endpoint for manual triggering/health check
export async function GET(request: NextRequest) {
  // Verify authorization for manual triggers
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Just return status without processing
  return NextResponse.json({
    status: 'healthy',
    endpoint: '/api/social/cron',
    method: 'POST to process scheduled posts',
    timestamp: new Date().toISOString(),
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/provision/status
 * Get provision job status and deployment info
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const jobId = searchParams.get('jobId');

    if (!companyId) {
      return NextResponse.json({ error: 'Missing companyId' }, { status: 400 });
    }

    // Verify company ownership
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .eq('user_id', user.id)
      .single();

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // If jobId provided, get specific job
    if (jobId) {
      const { data: job, error } = await supabase
        .from('provision_jobs')
        .select('*')
        .eq('id', jobId)
        .eq('company_id', companyId)
        .single();

      if (error || !job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }

      return NextResponse.json({ job });
    }

    // Get all jobs and deployment status for company
    const { data: jobs } = await supabase
      .from('provision_jobs')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(10);

    // Get deployment status from infrastructure assets
    const { data: assets } = await supabase
      .from('infrastructure_assets')
      .select('type, metadata')
      .eq('company_id', companyId);

    // Build deployment status map
    const deployments: Record<string, { deployed: boolean; url?: string; deployedAt?: string }> = {};

    assets?.forEach((asset) => {
      const metadata = asset.metadata as Record<string, unknown> | null;
      if (metadata?.deployed) {
        deployments[asset.type] = {
          deployed: true,
          url: metadata.deployedUrl as string | undefined,
          deployedAt: metadata.deployedAt as string | undefined,
        };
      } else {
        deployments[asset.type] = { deployed: false };
      }
    });

    return NextResponse.json({
      jobs: jobs || [],
      deployments,
    });
  } catch (error) {
    console.error('Provision status error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get status' },
      { status: 500 }
    );
  }
}

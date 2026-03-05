/**
 * Infrastructure Status API
 *
 * GET /api/infrastructure/status?companyId=xxx
 * Returns the current infrastructure generation status and assets.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getInfrastructureStatus } from '@/lib/infrastructure';

export async function GET(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get company ID from query
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    // Verify company ownership
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, user_id')
      .eq('id', companyId)
      .single();

    if (companyError || !company || company.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Company not found or unauthorized' },
        { status: 404 }
      );
    }

    // Get infrastructure status
    const status = await getInfrastructureStatus(supabase, companyId);

    // Get strategic documents
    const { data: strategicDocs } = await supabase
      .from('strategic_documents')
      .select('type, content, created_at, updated_at')
      .eq('company_id', companyId);

    return NextResponse.json({
      success: true,
      job: status.job,
      assets: status.assets,
      strategicDocuments: strategicDocs || [],
    });
  } catch (error) {
    console.error('Infrastructure status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/infrastructure/status
 * Regenerate a specific infrastructure asset.
 */
export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { companyId, assetType } = body;

    if (!companyId || !assetType) {
      return NextResponse.json(
        { error: 'Company ID and asset type are required' },
        { status: 400 }
      );
    }

    // Verify company ownership
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, user_id')
      .eq('id', companyId)
      .single();

    if (companyError || !company || company.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Company not found or unauthorized' },
        { status: 404 }
      );
    }

    // Mark asset as regenerating
    await supabase
      .from('infrastructure_assets')
      .update({
        status: 'generating',
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', companyId)
      .eq('type', assetType);

    return NextResponse.json({
      success: true,
      message: `Regeneration started for ${assetType}`,
    });
  } catch (error) {
    console.error('Infrastructure regenerate error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

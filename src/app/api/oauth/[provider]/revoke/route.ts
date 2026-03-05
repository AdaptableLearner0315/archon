import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { revokeOAuthConnection } from '@/lib/provisioning/oauth/handler';
import { PROVIDER_INFO, type OAuthProvider } from '@/lib/provisioning/types';

const VALID_PROVIDERS = Object.keys(PROVIDER_INFO) as OAuthProvider[];

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> }
) {
  try {
    const params = await context.params;
    const provider = params.provider as OAuthProvider;

    // Validate provider
    if (!VALID_PROVIDERS.includes(provider)) {
      return NextResponse.json(
        { error: `Invalid provider: ${provider}` },
        { status: 400 }
      );
    }

    // Authenticate user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get company ID from request body
    const body = await request.json();
    const { companyId } = body;

    if (!companyId) {
      return NextResponse.json({ error: 'Missing companyId' }, { status: 400 });
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

    // Revoke the connection
    const result = await revokeOAuthConnection(companyId, provider);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to disconnect' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('OAuth revoke error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to disconnect' },
      { status: 500 }
    );
  }
}

// Also support DELETE method
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> }
) {
  return POST(request, context);
}

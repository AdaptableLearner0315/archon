import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { initiateOAuth, encodeOAuthState } from '@/lib/provisioning/oauth/handler';
import { PROVIDER_INFO, type OAuthProvider } from '@/lib/provisioning/types';
import { cookies } from 'next/headers';

const VALID_PROVIDERS = Object.keys(PROVIDER_INFO) as OAuthProvider[];

export async function GET(
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

    // Supabase uses direct credentials, not OAuth
    if (provider === 'supabase') {
      return NextResponse.json(
        { error: 'Supabase uses direct credentials, not OAuth flow' },
        { status: 400 }
      );
    }

    // Authenticate user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get company ID from query params
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const returnUrl = searchParams.get('returnUrl') || '/dashboard/settings/integrations';

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

    // Initiate OAuth flow
    const { authUrl, state } = await initiateOAuth(provider, companyId, returnUrl);

    // Store state in a secure cookie for validation in callback
    const cookieStore = await cookies();
    const encodedState = encodeOAuthState(state);

    cookieStore.set(`oauth_state_${provider}`, encodedState, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10, // 10 minutes
      path: '/',
    });

    // Redirect to provider authorization page
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('OAuth authorize error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to initiate OAuth' },
      { status: 500 }
    );
  }
}

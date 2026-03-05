import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { handleOAuthCallback, decodeOAuthState } from '@/lib/provisioning/oauth/handler';
import { PROVIDER_INFO, type OAuthProvider } from '@/lib/provisioning/types';

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
      return redirectWithError(
        '/dashboard/settings/integrations',
        `Invalid provider: ${provider}`
      );
    }

    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const stateParam = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle provider errors
    if (error) {
      console.error(`OAuth error from ${provider}:`, error, errorDescription);
      return redirectWithError(
        '/dashboard/settings/integrations',
        errorDescription || error
      );
    }

    if (!code || !stateParam) {
      return redirectWithError(
        '/dashboard/settings/integrations',
        'Missing authorization code or state'
      );
    }

    // Decode and validate state
    const state = decodeOAuthState(stateParam);
    if (!state || state.provider !== provider) {
      return redirectWithError(
        '/dashboard/settings/integrations',
        'Invalid OAuth state'
      );
    }

    // Verify state matches cookie (CSRF protection)
    const cookieStore = await cookies();
    const storedState = cookieStore.get(`oauth_state_${provider}`)?.value;

    if (!storedState) {
      return redirectWithError(
        state.returnUrl || '/dashboard/settings/integrations',
        'OAuth session expired. Please try again.'
      );
    }

    const decodedStoredState = decodeOAuthState(storedState);
    if (!decodedStoredState || decodedStoredState.nonce !== state.nonce) {
      return redirectWithError(
        state.returnUrl || '/dashboard/settings/integrations',
        'Invalid OAuth state. Please try again.'
      );
    }

    // Merge code verifier from cookie state (for PKCE)
    if (decodedStoredState.codeVerifier) {
      state.codeVerifier = decodedStoredState.codeVerifier;
    }

    // Clear the state cookie
    cookieStore.delete(`oauth_state_${provider}`);

    // Handle the callback
    const result = await handleOAuthCallback(provider, code, state);

    if (!result.success) {
      return redirectWithError(
        state.returnUrl || '/dashboard/settings/integrations',
        result.error || 'Failed to connect account'
      );
    }

    // Success - redirect back to integrations page
    const successUrl = new URL(
      state.returnUrl || '/dashboard/settings/integrations',
      process.env.NEXT_PUBLIC_APP_URL
    );
    successUrl.searchParams.set('connected', provider);
    successUrl.searchParams.set('account', result.account?.account_name || provider);

    return NextResponse.redirect(successUrl.toString());
  } catch (error) {
    console.error('OAuth callback error:', error);
    return redirectWithError(
      '/dashboard/settings/integrations',
      error instanceof Error ? error.message : 'Failed to complete OAuth'
    );
  }
}

function redirectWithError(returnUrl: string, error: string): NextResponse {
  const url = new URL(returnUrl, process.env.NEXT_PUBLIC_APP_URL);
  url.searchParams.set('error', error);
  return NextResponse.redirect(url.toString());
}

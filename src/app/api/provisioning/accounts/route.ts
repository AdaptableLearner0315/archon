import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { ConnectedAccount } from '@/lib/provisioning/types';

/**
 * GET /api/provisioning/accounts
 * List all connected accounts for a company
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

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

    // Get all connected accounts
    const { data: accounts, error } = await supabase
      .from('connected_accounts')
      .select('*')
      .eq('company_id', companyId)
      .order('connected_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      accounts: accounts as ConnectedAccount[],
    });
  } catch (error) {
    console.error('Get connected accounts error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get accounts' },
      { status: 500 }
    );
  }
}

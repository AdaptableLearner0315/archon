import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Debug endpoint to check auth context as dashboard would see it
 * Helps diagnose user ID mismatches between API routes and layout checks
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({
        userId: null,
        userEmail: null,
        company: null,
        companyError: authError?.message || 'No authenticated user',
        authError: authError?.message || 'User not found',
      });
    }

    const { data: companies, error: companyError } = await supabase
      .from('companies')
      .select('id, user_id, name, slug, plan')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1);

    const company = companies?.[0] || null;

    return NextResponse.json({
      userId: user.id,
      userEmail: user.email,
      company,
      companyCount: companies?.length || 0,
      companyError: companyError?.message || null,
      companyErrorCode: companyError?.code || null,
    });
  } catch (error) {
    console.error('Debug auth-context error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

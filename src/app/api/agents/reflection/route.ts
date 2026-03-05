import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  runReflection,
  getLatestReflection,
  getReflectionHistory,
} from '@/lib/agents/reflection';
import type { ReflectionPeriod } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const period = searchParams.get('period') as ReflectionPeriod | null;
    const history = searchParams.get('history') === 'true';
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50);

    if (!companyId) {
      return new Response(JSON.stringify({ error: 'Missing companyId' }), { status: 400 });
    }

    // Verify ownership
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .eq('user_id', user.id)
      .single();

    if (!company) {
      return new Response(JSON.stringify({ error: 'Company not found' }), { status: 404 });
    }

    if (history) {
      const reflections = await getReflectionHistory(companyId, supabase, limit);
      return new Response(JSON.stringify({ reflections }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const reflection = await getLatestReflection(companyId, supabase, period || undefined);
    return new Response(JSON.stringify({ reflection }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Reflection GET error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const body = await request.json();
    const { companyId, period } = body as { companyId: string; period?: ReflectionPeriod };

    if (!companyId) {
      return new Response(JSON.stringify({ error: 'Missing companyId' }), { status: 400 });
    }

    // Verify ownership
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .eq('user_id', user.id)
      .single();

    if (!company) {
      return new Response(JSON.stringify({ error: 'Company not found' }), { status: 404 });
    }

    // Run reflection
    const reflection = await runReflection(companyId, supabase, {
      period: period || 'weekly',
    });

    return new Response(JSON.stringify({ reflection }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Reflection POST error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}

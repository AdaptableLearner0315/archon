import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
    const offset = parseInt(searchParams.get('offset') || '0');

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

    const { data: notifications, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Get unread count
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('read', false);

    return new Response(JSON.stringify({
      notifications: notifications || [],
      unreadCount: count || 0,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Notifications GET error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const body = await request.json();
    const { notificationIds, companyId, markAllRead } = body;

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

    if (markAllRead) {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('company_id', companyId)
        .eq('read', false);
    } else if (notificationIds?.length > 0) {
      await supabase
        .from('notifications')
        .update({ read: true })
        .in('id', notificationIds)
        .eq('company_id', companyId);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Notifications PATCH error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}

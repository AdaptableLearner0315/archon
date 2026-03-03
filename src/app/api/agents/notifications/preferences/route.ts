import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const E164_REGEX = /^\+[1-9]\d{1,14}$/;

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return new Response(JSON.stringify({ error: 'Missing companyId' }), { status: 400 });
    }

    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .eq('user_id', user.id)
      .single();

    if (!company) {
      return new Response(JSON.stringify({ error: 'Company not found' }), { status: 404 });
    }

    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('company_id', companyId)
      .single();

    return new Response(JSON.stringify({
      preferences: prefs || {
        email_enabled: true,
        email_address: null,
        whatsapp_enabled: false,
        whatsapp_number: null,
        digest_format: 'detailed',
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Notification prefs GET error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const body = await request.json();
    const { companyId, emailEnabled, emailAddress, whatsappEnabled, whatsappNumber, digestFormat } = body;

    if (!companyId) {
      return new Response(JSON.stringify({ error: 'Missing companyId' }), { status: 400 });
    }

    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .eq('user_id', user.id)
      .single();

    if (!company) {
      return new Response(JSON.stringify({ error: 'Company not found' }), { status: 404 });
    }

    // Validate inputs
    if (emailAddress && typeof emailAddress !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid email address' }), { status: 400 });
    }

    if (whatsappNumber && !E164_REGEX.test(whatsappNumber)) {
      return new Response(JSON.stringify({ error: 'Invalid WhatsApp number. Must be E.164 format (e.g., +1234567890)' }), { status: 400 });
    }

    if (digestFormat && !['brief', 'detailed'].includes(digestFormat)) {
      return new Response(JSON.stringify({ error: 'Invalid digest format' }), { status: 400 });
    }

    const prefData = {
      company_id: companyId,
      email_enabled: emailEnabled ?? true,
      email_address: emailAddress ?? null,
      whatsapp_enabled: whatsappEnabled ?? false,
      whatsapp_number: whatsappNumber ?? null,
      digest_format: digestFormat ?? 'detailed',
    };

    // Upsert
    const { data: existing } = await supabase
      .from('notification_preferences')
      .select('id')
      .eq('company_id', companyId)
      .single();

    let result;
    if (existing) {
      result = await supabase
        .from('notification_preferences')
        .update(prefData)
        .eq('company_id', companyId)
        .select()
        .single();
    } else {
      result = await supabase
        .from('notification_preferences')
        .insert(prefData)
        .select()
        .single();
    }

    if (result.error) throw result.error;

    return new Response(JSON.stringify({ preferences: result.data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Notification prefs PUT error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}

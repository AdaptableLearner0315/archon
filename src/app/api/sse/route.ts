import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get('companyId');

  if (!companyId) {
    return new Response(JSON.stringify({ error: 'Missing companyId' }), { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  // Verify company ownership
  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .eq('user_id', user.id)
    .single();

  if (!company) {
    return new Response(JSON.stringify({ error: 'Company not found' }), { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected', companyId })}\n\n`)
      );

      // Poll for new activities every 5 seconds
      let lastCheck = new Date().toISOString();

      const interval = setInterval(async () => {
        try {
          const { data: newActivities } = await supabase
            .from('agent_activities')
            .select('*')
            .eq('company_id', companyId)
            .gt('created_at', lastCheck)
            .order('created_at', { ascending: true });

          if (newActivities && newActivities.length > 0) {
            for (const activity of newActivities) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'activity',
                    data: {
                      id: activity.id,
                      agentRole: activity.agent_role,
                      agentName: activity.agent_name,
                      action: activity.action,
                      detail: activity.detail,
                      type: activity.type,
                      timestamp: activity.created_at,
                    },
                  })}\n\n`
                )
              );
            }
            lastCheck = newActivities[newActivities.length - 1].created_at;
          }

          // Send keepalive
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          // Silently handle polling errors
        }
      }, 5000);

      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

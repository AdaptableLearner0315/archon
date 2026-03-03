import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { startCycle, isCompanyCycleActive } from '@/lib/agents/cycle/cycle-engine';
import type { CycleStreamEvent } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const body = await request.json();
    const { companyId, directive } = body;

    if (!companyId || typeof companyId !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing companyId' }), { status: 400 });
    }

    if (directive && (typeof directive !== 'string' || directive.length > 10000)) {
      return new Response(JSON.stringify({ error: 'Invalid directive' }), { status: 400 });
    }

    // Verify company ownership
    const { data: company } = await supabase
      .from('companies')
      .select('id, plan')
      .eq('id', companyId)
      .eq('user_id', user.id)
      .single();

    if (!company) {
      return new Response(JSON.stringify({ error: 'Company not found' }), { status: 404 });
    }

    // Rate limit: 1 concurrent
    if (isCompanyCycleActive(companyId)) {
      return new Response(JSON.stringify({ error: 'A cycle is already running' }), { status: 429 });
    }

    // Rate limit: 10/day
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from('operating_cycles')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .gte('created_at', today.toISOString());

    if (count && count >= 10) {
      return new Response(JSON.stringify({ error: 'Daily cycle limit reached (10/day)' }), { status: 429 });
    }

    // Stream cycle events via SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const onEvent = (event: CycleStreamEvent) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch {
            // Stream may be closed
          }
        };

        try {
          const cycle = await startCycle(companyId, 'manual', directive || null, supabase, onEvent);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              type: 'cycle_done',
              cycleId: cycle.id,
              timestamp: new Date().toISOString(),
            })}\n\n`)
          );
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Cycle failed';
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              type: 'error',
              content: errorMsg,
              timestamp: new Date().toISOString(),
            })}\n\n`)
          );
        } finally {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Cycle route error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}

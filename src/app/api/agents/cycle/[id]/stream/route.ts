import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const { id } = await params;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return new Response(JSON.stringify({ error: 'Invalid cycle ID' }), { status: 400 });
    }

    const { data: cycle } = await supabase
      .from('operating_cycles')
      .select('id, status, company_id')
      .eq('id', id)
      .single();

    if (!cycle) {
      return new Response(JSON.stringify({ error: 'Cycle not found' }), { status: 404 });
    }

    // If already done, return current state immediately
    if (['done', 'failed'].includes(cycle.status)) {
      const { data: tasks } = await supabase
        .from('cycle_tasks')
        .select('*')
        .eq('cycle_id', id);

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              type: 'cycle_done',
              cycleId: id,
              status: cycle.status,
              tasks: tasks || [],
              timestamp: new Date().toISOString(),
            })}\n\n`)
          );
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
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

    // For active cycles, poll for updates
    const encoder = new TextEncoder();
    let lastTaskHash = '';

    const stream = new ReadableStream({
      async start(controller) {
        const interval = setInterval(async () => {
          try {
            const { data: currentCycle } = await supabase
              .from('operating_cycles')
              .select('status')
              .eq('id', id)
              .single();

            const { data: tasks } = await supabase
              .from('cycle_tasks')
              .select('*')
              .eq('cycle_id', id)
              .order('created_at', { ascending: true });

            const taskHash = JSON.stringify(tasks?.map((t) => ({ id: t.id, status: t.status })));

            if (taskHash !== lastTaskHash) {
              lastTaskHash = taskHash;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({
                  type: 'cycle_status',
                  cycleId: id,
                  status: currentCycle?.status,
                  tasks: tasks || [],
                  timestamp: new Date().toISOString(),
                })}\n\n`)
              );
            }

            if (currentCycle?.status === 'done' || currentCycle?.status === 'failed') {
              clearInterval(interval);
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            }
          } catch {
            clearInterval(interval);
            controller.close();
          }
        }, 2000);

        // Timeout after 6 minutes
        setTimeout(() => {
          clearInterval(interval);
          try {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch {
            // Already closed
          }
        }, 360000);
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
    console.error('Cycle stream error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}

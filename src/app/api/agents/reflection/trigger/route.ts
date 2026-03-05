import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  triggerRecommendation,
  updateTriggerStatus,
} from '@/lib/agents/reflection';
import { startCycle } from '@/lib/agents/cycle/cycle-engine';
import type { TriggerSource } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const body = await request.json();
    const { reflectionId, recommendationId, triggeredVia } = body as {
      reflectionId: string;
      recommendationId: string;
      triggeredVia?: TriggerSource;
    };

    if (!reflectionId || !recommendationId) {
      return new Response(JSON.stringify({ error: 'Missing reflectionId or recommendationId' }), { status: 400 });
    }

    // Get reflection and verify ownership
    const { data: reflection } = await supabase
      .from('agent_reflections')
      .select('*, companies!inner(id, user_id)')
      .eq('id', reflectionId)
      .single();

    if (!reflection) {
      return new Response(JSON.stringify({ error: 'Reflection not found' }), { status: 404 });
    }

    const companyData = reflection.companies as { id: string; user_id: string };
    if (companyData.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 403 });
    }

    // Trigger the recommendation
    const { triggerId, recommendation } = await triggerRecommendation(
      reflectionId,
      recommendationId,
      triggeredVia || 'webapp',
      supabase
    );

    if (!recommendation) {
      return new Response(JSON.stringify({ error: 'Recommendation not found' }), { status: 404 });
    }

    // Start a cycle with the recommendation directive
    const directive = recommendation.suggestedAction.directive;
    const companyId = reflection.company_id;

    // Update trigger status to running
    await updateTriggerStatus(triggerId, 'running', null, supabase);

    // Start cycle in background (non-blocking)
    startCycle(companyId, 'api', directive, supabase, () => {
      // No-op event handler for trigger-initiated cycles
    })
      .then(async (cycle) => {
        await updateTriggerStatus(
          triggerId,
          cycle.status === 'done' ? 'completed' : 'failed',
          cycle.id,
          supabase
        );
      })
      .catch(async () => {
        await updateTriggerStatus(triggerId, 'failed', null, supabase);
      });

    return new Response(
      JSON.stringify({
        success: true,
        triggerId,
        message: `Executing: ${recommendation.title}`,
        directive,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Trigger POST error:', error);
    const message = error instanceof Error ? error.message : 'Internal error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}

// GET trigger status
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const triggerId = searchParams.get('triggerId');
    const reflectionId = searchParams.get('reflectionId');

    if (!triggerId && !reflectionId) {
      return new Response(JSON.stringify({ error: 'Missing triggerId or reflectionId' }), { status: 400 });
    }

    if (triggerId) {
      // Get single trigger status
      const { data: trigger } = await supabase
        .from('reflection_triggers')
        .select('*, agent_reflections!inner(company_id, companies!inner(user_id))')
        .eq('id', triggerId)
        .single();

      if (!trigger) {
        return new Response(JSON.stringify({ error: 'Trigger not found' }), { status: 404 });
      }

      // Verify ownership through nested joins
      const reflectionData = trigger.agent_reflections as { company_id: string; companies: { user_id: string } };
      if (reflectionData.companies.user_id !== user.id) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 403 });
      }

      return new Response(
        JSON.stringify({
          trigger: {
            id: trigger.id,
            reflectionId: trigger.reflection_id,
            recommendationId: trigger.recommendation_id,
            triggeredAt: trigger.triggered_at,
            triggeredVia: trigger.triggered_via,
            cycleId: trigger.cycle_id,
            status: trigger.status,
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Get all triggers for a reflection
    const { data: triggers } = await supabase
      .from('reflection_triggers')
      .select('*, agent_reflections!inner(company_id, companies!inner(user_id))')
      .eq('reflection_id', reflectionId)
      .order('triggered_at', { ascending: false });

    // Filter by user ownership
    const userTriggers = (triggers || []).filter((t) => {
      const reflectionData = t.agent_reflections as { company_id: string; companies: { user_id: string } };
      return reflectionData.companies.user_id === user.id;
    });

    return new Response(
      JSON.stringify({
        triggers: userTriggers.map((t) => ({
          id: t.id,
          reflectionId: t.reflection_id,
          recommendationId: t.recommendation_id,
          triggeredAt: t.triggered_at,
          triggeredVia: t.triggered_via,
          cycleId: t.cycle_id,
          status: t.status,
        })),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Trigger GET error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}

import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { streamCommand } from '@/lib/agents/engine';
import { executeTeamTask, DEFAULT_TEAM, parseTeamCommand, shouldUseTeam } from '@/lib/agents/cycle/team-executor';
import type { CycleStreamEvent } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const { directive, companyId, companyName } = await request.json();

    if (!directive || !companyId) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
    }

    // Validate input
    if (typeof directive !== 'string' || directive.length > 10000) {
      return new Response(JSON.stringify({ error: 'Invalid directive' }), { status: 400 });
    }

    // Verify company ownership
    const { data: company } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .eq('user_id', user.id)
      .single();

    if (!company) {
      return new Response(JSON.stringify({ error: 'Company not found' }), { status: 404 });
    }

    // Check for /team command or auto-detect complex tasks
    const isTeamCommand = directive.toLowerCase().startsWith('/team ');
    const shouldAutoTeam = shouldUseTeam(directive);

    if (isTeamCommand || shouldAutoTeam) {
      const teamDirective = isTeamCommand ? parseTeamCommand(directive) : directive;

      // Save user message first
      await supabase.from('command_messages').insert({
        company_id: companyId,
        role: 'user',
        content: directive,
      });

      // Build company context for team execution
      const teamCompanyContext = `
Company: ${companyName}
Description: ${company.description}
Goal: ${company.goal}
Ad Budget: ${company.ad_budget}
Plan: ${company.plan}
      `.trim();

      // Create an operating cycle for the team task
      const { data: cycle } = await supabase.from('operating_cycles').insert({
        company_id: companyId,
        status: 'executing',
        trigger: 'manual',
        user_directive: teamDirective,
        started_at: new Date().toISOString(),
      }).select().single();

      if (!cycle) {
        return new Response(JSON.stringify({ error: 'Failed to create cycle' }), { status: 500 });
      }

      // Stream team task execution
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            // Build minimal deps for team execution
            const { WorkingMemory } = await import('@/lib/agents/memory/working-memory');
            const { ShortTermMemoryStore } = await import('@/lib/agents/memory/short-term');
            const { LongTermMemoryStore } = await import('@/lib/agents/memory/long-term');
            const { ContextBuilder } = await import('@/lib/agents/memory/context-builder');
            const { MessageBus } = await import('@/lib/agents/message-bus');

            const workingMemory = new WorkingMemory(cycle.id);
            const shortTermStore = new ShortTermMemoryStore(supabase);
            const longTermStore = new LongTermMemoryStore(supabase);
            const contextBuilder = new ContextBuilder(workingMemory, shortTermStore, longTermStore);

            const deps = {
              supabase,
              workingMemory,
              shortTermStore,
              contextBuilder,
              messageBus: new MessageBus(cycle.id, companyId, supabase),
              companyContext: teamCompanyContext,
              companyPlan: company.plan,
              companyId,
            };

            // Stream events to client
            const streamEvent = (event: CycleStreamEvent) => {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
              );
            };

            // Execute team task
            const result = await executeTeamTask(
              cycle.id,
              companyId,
              {
                description: teamDirective,
                agents: DEFAULT_TEAM,
                mergeStrategy: 'synthesize',
              },
              deps,
              supabase,
              streamEvent
            );

            // Save merged result as agent response
            if (result.mergedResult) {
              await supabase.from('command_messages').insert({
                company_id: companyId,
                role: 'agent',
                agent_role: 'ceo',
                agent_name: 'Atlas (Team Lead)',
                content: result.mergedResult,
              });

              // Final text chunk for UI
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text: result.mergedResult })}\n\n`)
              );
            }

            // Update cycle status
            await supabase.from('operating_cycles').update({
              status: result.status === 'completed' ? 'done' : 'failed',
              completed_at: new Date().toISOString(),
            }).eq('id', cycle.id);

            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch (err) {
            console.error('Team task error:', err);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ error: 'Team task failed' })}\n\n`)
            );
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
    }

    // Continue with normal (non-team) execution below...

    // Save user message
    await supabase.from('command_messages').insert({
      company_id: companyId,
      role: 'user',
      content: directive,
    });

    // Build company context
    const companyContext = `
Company: ${companyName}
Description: ${company.description}
Goal: ${company.goal}
Ad Budget: ${company.ad_budget}
Plan: ${company.plan}
    `.trim();

    // Load memory context (short-term + long-term)
    const [{ data: shortTermMem }, { data: longTermMem }] = await Promise.all([
      supabase
        .from('agent_memory_short_term')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('agent_memory_long_term')
        .select('*')
        .eq('company_id', companyId)
        .order('last_referenced_at', { ascending: false })
        .limit(10),
    ]);

    const memoryContext = {
      workingMemory: [],
      shortTermMemories: (shortTermMem || []).map((m) => ({
        id: m.id,
        companyId: m.company_id,
        agentRole: m.agent_role,
        topic: m.topic,
        content: m.content,
        memoryType: m.memory_type,
        relevanceScore: m.relevance_score,
        expiresAt: m.expires_at,
        createdAt: m.created_at,
      })),
      longTermMemories: (longTermMem || []).map((m) => ({
        id: m.id,
        companyId: m.company_id,
        agentRole: m.agent_role,
        category: m.category,
        summary: m.summary,
        confidence: m.confidence,
        timesReferenced: m.times_referenced,
        lastReferencedAt: m.last_referenced_at,
        createdAt: m.created_at,
      })),
      tokenEstimate: 0,
    };

    // Load recent message history
    const { data: history } = await supabase
      .from('command_messages')
      .select('role, content, agent_role, agent_name')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(10);

    const messageHistory = (history || []).reverse().map((h) => ({
      role: (h.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: h.role === 'agent' && h.agent_name
        ? `**${h.agent_name}:** ${h.content}`
        : h.content,
    }));

    // Stream response using SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let fullText = '';

          for await (const chunk of streamCommand(directive, companyContext, messageHistory, memoryContext)) {
            fullText += chunk;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`)
            );
          }

          // Save agent response to database
          const agentPattern = /\*\*(\w+):\*\*\s*([\s\S]*?)(?=\*\*\w+:\*\*|$)/g;
          let match;

          const roleMap: Record<string, string> = {
            Atlas: 'ceo', Forge: 'engineer', Pulse: 'growth', Echo: 'marketing',
            Prism: 'product', Nexus: 'operations', Arrow: 'sales', Shield: 'support',
            Lens: 'data-analyst', Bloom: 'customer-success',
          };

          let hasAgent = false;
          while ((match = agentPattern.exec(fullText)) !== null) {
            hasAgent = true;
            const agentName = match[1];
            const content = match[2].trim();
            const agentRole = roleMap[agentName] || 'ceo';

            await supabase.from('command_messages').insert({
              company_id: companyId,
              role: 'agent',
              agent_role: agentRole,
              agent_name: agentName,
              content,
            });

            await supabase.from('agent_activities').insert({
              company_id: companyId,
              agent_role: agentRole,
              agent_name: agentName,
              action: 'Executed directive',
              detail: content.slice(0, 200),
              type: 'action',
            });

            // Store as short-term memory (conversation summary)
            supabase.from('agent_memory_short_term').insert({
              company_id: companyId,
              agent_role: agentRole,
              topic: 'command_response',
              content: `Responded to: "${directive.slice(0, 100)}". Key points: ${content.slice(0, 500)}`,
              memory_type: 'conversation_summary',
            }).then(() => {}); // fire-and-forget
          }

          if (!hasAgent && fullText) {
            await supabase.from('command_messages').insert({
              company_id: companyId,
              role: 'agent',
              agent_role: 'ceo',
              agent_name: 'Atlas',
              content: fullText,
            });
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err) {
          console.error('Stream error:', err);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: 'Stream failed' })}\n\n`)
          );
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
    console.error('Agent execute error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}

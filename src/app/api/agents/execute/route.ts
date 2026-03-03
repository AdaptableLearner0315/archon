import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { streamCommand } from '@/lib/agents/engine';

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

          for await (const chunk of streamCommand(directive, companyContext, messageHistory)) {
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
              action: `Executed directive`,
              detail: content.slice(0, 200),
              type: 'action',
            });
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

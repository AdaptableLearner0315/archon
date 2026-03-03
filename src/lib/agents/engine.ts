import Anthropic from '@anthropic-ai/sdk';
import { ORCHESTRATOR_PROMPT, AGENT_SYSTEM_PROMPTS } from './prompts';
import type { AgentRole } from '../types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export interface AgentResponse {
  agentRole: AgentRole;
  agentName: string;
  content: string;
}

const AGENT_NAMES: Record<AgentRole, string> = {
  ceo: 'Atlas',
  engineer: 'Forge',
  growth: 'Pulse',
  marketing: 'Echo',
  product: 'Prism',
  operations: 'Nexus',
  sales: 'Arrow',
  support: 'Shield',
  'data-analyst': 'Lens',
  'customer-success': 'Bloom',
};

export async function executeCommand(
  directive: string,
  companyContext: string,
  history: { role: 'user' | 'assistant'; content: string }[] = []
): Promise<AgentResponse[]> {
  const systemPrompt = `${ORCHESTRATOR_PROMPT}

Company Context:
${companyContext}

Respond as the relevant agent(s). Each agent response should be prefixed with the agent name like "**Atlas:** ..." or "**Forge:** ...".`;

  const messages: Anthropic.MessageParam[] = [
    ...history.map((h) => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    })),
    { role: 'user', content: directive },
  ];

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: systemPrompt,
    messages,
  });

  const text = response.content
    .filter((c): c is Anthropic.TextBlock => c.type === 'text')
    .map((c) => c.text)
    .join('\n');

  return parseAgentResponses(text);
}

function parseAgentResponses(text: string): AgentResponse[] {
  const responses: AgentResponse[] = [];
  const agentPattern = /\*\*(\w+):\*\*\s*([\s\S]*?)(?=\*\*\w+:\*\*|$)/g;
  let match;

  while ((match = agentPattern.exec(text)) !== null) {
    const name = match[1];
    const content = match[2].trim();
    const role = Object.entries(AGENT_NAMES).find(
      ([, n]) => n.toLowerCase() === name.toLowerCase()
    );

    if (role) {
      responses.push({
        agentRole: role[0] as AgentRole,
        agentName: name,
        content,
      });
    }
  }

  // If no agent pattern found, attribute to CEO
  if (responses.length === 0) {
    responses.push({
      agentRole: 'ceo',
      agentName: 'Atlas',
      content: text,
    });
  }

  return responses;
}

export async function* streamCommand(
  directive: string,
  companyContext: string,
  history: { role: 'user' | 'assistant'; content: string }[] = []
): AsyncGenerator<string> {
  const systemPrompt = `${ORCHESTRATOR_PROMPT}

Company Context:
${companyContext}

Respond as the relevant agent(s). Each agent response should be prefixed with the agent name like "**Atlas:** ..." or "**Forge:** ...".`;

  const messages: Anthropic.MessageParam[] = [
    ...history.map((h) => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    })),
    { role: 'user', content: directive },
  ];

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: systemPrompt,
    messages,
  });

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      yield event.delta.text;
    }
  }
}

export async function runAgentTask(
  role: AgentRole,
  task: string,
  companyContext: string
): Promise<string> {
  const systemPrompt = `${AGENT_SYSTEM_PROMPTS[role]}

Company Context:
${companyContext}

Execute the following task with depth and precision. Provide real, actionable output — not vague suggestions.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: task }],
  });

  return response.content
    .filter((c): c is Anthropic.TextBlock => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
}

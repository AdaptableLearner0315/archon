import { ClaudeClient } from './claude-client';
import { ORCHESTRATOR_PROMPT, AGENT_SYSTEM_PROMPTS, buildAgentSystemPrompt } from './prompts';
import type { AgentRole, MemoryContext } from '../types';
import type Anthropic from '@anthropic-ai/sdk';

export interface AgentResponse {
  agentRole: AgentRole;
  agentName: string;
  content: string;
}

export const AGENT_NAMES: Record<AgentRole, string> = {
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
  seo: 'Scout',
  ads: 'Spark',
};

export function parseAgentResponses(text: string): AgentResponse[] {
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

  if (responses.length === 0) {
    responses.push({
      agentRole: 'ceo',
      agentName: 'Atlas',
      content: text,
    });
  }

  return responses;
}

export async function executeCommand(
  directive: string,
  companyContext: string,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
  memoryContext?: MemoryContext
): Promise<AgentResponse[]> {
  const memorySection = memoryContext
    ? `\n\n## Agent Memory Context\n${formatMemoryForPrompt(memoryContext)}`
    : '';

  const systemPrompt = `${ORCHESTRATOR_PROMPT}

Company Context:
${companyContext}${memorySection}

Respond as the relevant agent(s). Each agent response should be prefixed with the agent name like "**Atlas:** ..." or "**Forge:** ...".`;

  const messages: Anthropic.MessageParam[] = [
    ...history.map((h) => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    })),
    { role: 'user', content: directive },
  ];

  const result = await ClaudeClient.call({
    useCase: 'command_center',
    system: systemPrompt,
    messages,
  });

  return parseAgentResponses(result.text);
}

export async function* streamCommand(
  directive: string,
  companyContext: string,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
  memoryContext?: MemoryContext
): AsyncGenerator<string> {
  const memorySection = memoryContext
    ? `\n\n## Agent Memory Context\n${formatMemoryForPrompt(memoryContext)}`
    : '';

  const systemPrompt = `${ORCHESTRATOR_PROMPT}

Company Context:
${companyContext}${memorySection}

Respond as the relevant agent(s). Each agent response should be prefixed with the agent name like "**Atlas:** ..." or "**Forge:** ...".`;

  const messages: Anthropic.MessageParam[] = [
    ...history.map((h) => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    })),
    { role: 'user', content: directive },
  ];

  for await (const chunk of ClaudeClient.stream({
    useCase: 'command_center',
    system: systemPrompt,
    messages,
  })) {
    if (chunk.type === 'text') {
      yield chunk.content;
    }
  }
}

export async function runAgentTask(
  role: AgentRole,
  task: string,
  companyContext: string,
  memoryContext?: MemoryContext,
  cycleContext?: string
): Promise<{ text: string; usage: { inputTokens: number; outputTokens: number }; costUsd: number }> {
  const systemPrompt = buildAgentSystemPrompt(role, companyContext, memoryContext, cycleContext);

  const result = await ClaudeClient.call({
    useCase: 'agent_task',
    system: systemPrompt,
    messages: [{ role: 'user', content: task }],
  });

  return {
    text: result.text,
    usage: result.usage,
    costUsd: result.costUsd,
  };
}

function formatMemoryForPrompt(context: MemoryContext): string {
  const sections: string[] = [];

  if (context.longTermMemories.length > 0) {
    sections.push('### Company Knowledge');
    for (const mem of context.longTermMemories) {
      sections.push(`- [${mem.category}] ${mem.summary}`);
    }
  }

  if (context.shortTermMemories.length > 0) {
    sections.push('### Recent Context');
    for (const mem of context.shortTermMemories) {
      sections.push(`- [${mem.memoryType}] ${mem.content.slice(0, 300)}`);
    }
  }

  if (context.workingMemory.length > 0) {
    sections.push('### Current Cycle Context');
    for (const mem of context.workingMemory) {
      sections.push(`- ${mem.key}: ${String(mem.value).slice(0, 200)}`);
    }
  }

  return sections.join('\n');
}

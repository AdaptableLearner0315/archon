import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentRole, CycleTask, CycleStreamEvent } from '../../types';
import { ClaudeClient } from '../claude-client';
import { CostTracker } from '../cost-tracker';
import { AGENT_NAMES } from '../engine';
import { buildAgentSystemPrompt } from '../prompts';
import type { WorkingMemory } from '../memory/working-memory';
import type { ShortTermMemoryStore } from '../memory/short-term';
import type { ContextBuilder } from '../memory/context-builder';
import type { MessageBus } from '../message-bus';

const REQUEST_MARKER_REGEX = /\[REQUEST:\s*(\w+)\s*\|\s*(.+?)\]/g;
const MAX_RERUN_DEPTH = 2;

export interface TaskRunnerDeps {
  supabase: SupabaseClient;
  workingMemory: WorkingMemory;
  shortTermStore: ShortTermMemoryStore;
  contextBuilder: ContextBuilder;
  messageBus: MessageBus;
  companyContext: string;
  companyPlan: string;
  companyId: string;
}

export interface TaskRunResult {
  status: 'completed' | 'needs_data' | 'failed';
  result: string;
  requests: { targetRole: AgentRole; question: string }[];
  tokensUsed: number;
  costUsd: number;
}

export async function runTask(
  task: CycleTask,
  deps: TaskRunnerDeps,
  onEvent: (event: CycleStreamEvent) => void,
  injectedResponses?: Map<string, string>,
  rerunDepth: number = 0
): Promise<TaskRunResult> {
  const agentRole = task.agentRole;
  const agentName = AGENT_NAMES[agentRole] || agentRole;

  try {
    // 1. Build agent context
    const memoryContext = await deps.contextBuilder.buildContext(
      deps.companyId,
      agentRole,
      task.description
    );

    // Build cycle context from bus messages
    const busContext = deps.messageBus.formatMessagesForAgent(agentRole);

    // Include injected responses from previous inter-agent requests
    let injectedContext = '';
    if (injectedResponses && injectedResponses.size > 0) {
      injectedContext = '\n## Responses to Your Previous Requests\n';
      for (const [question, answer] of injectedResponses) {
        injectedContext += `\n**Request:** ${question}\n**Response:** ${answer}\n`;
      }
    }

    const fullCycleContext = [busContext, injectedContext].filter(Boolean).join('\n');

    // 2. Get active prompt (check prompt_versions first, fall back to default)
    const { data: activePrompt } = await deps.supabase
      .from('prompt_versions')
      .select('prompt_text')
      .eq('company_id', deps.companyId)
      .eq('agent_role', agentRole)
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    // 3. Build system prompt
    const systemPrompt = activePrompt?.prompt_text
      ? `${activePrompt.prompt_text}\n\nCompany Context:\n${deps.companyContext}${fullCycleContext ? `\n\n${fullCycleContext}` : ''}\n\nExecute the following task with depth and precision. Provide real, actionable output — not vague suggestions.`
      : buildAgentSystemPrompt(agentRole, deps.companyContext, memoryContext, fullCycleContext);

    // 4. Stream Claude response
    let fullText = '';
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;

    onEvent({
      type: 'task_status',
      cycleId: task.cycleId,
      taskId: task.id,
      agentRole,
      agentName,
      status: 'running',
      timestamp: new Date().toISOString(),
    });

    for await (const chunk of ClaudeClient.stream({
      useCase: 'agent_task',
      system: systemPrompt,
      messages: [{ role: 'user', content: task.description }],
    })) {
      if (chunk.type === 'thinking') {
        onEvent({
          type: 'agent_thinking',
          cycleId: task.cycleId,
          taskId: task.id,
          agentRole,
          agentName,
          content: chunk.content,
          timestamp: new Date().toISOString(),
        });
      } else if (chunk.type === 'text') {
        fullText += chunk.content;
        onEvent({
          type: 'agent_text',
          cycleId: task.cycleId,
          taskId: task.id,
          agentRole,
          agentName,
          content: chunk.content,
          timestamp: new Date().toISOString(),
        });
      } else if (chunk.type === 'done') {
        totalInputTokens = chunk.usage?.inputTokens ?? 0;
        totalOutputTokens = chunk.usage?.outputTokens ?? 0;
        totalCost = chunk.costUsd ?? 0;
      }
    }

    // 5. Track cost
    CostTracker.record(
      task.cycleId,
      agentRole,
      { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      totalCost
    );

    // 6. Parse [REQUEST:] markers
    const requests: { targetRole: AgentRole; question: string }[] = [];
    const nameToRole: Record<string, AgentRole> = {};
    for (const [role, name] of Object.entries(AGENT_NAMES)) {
      nameToRole[name] = role as AgentRole;
    }

    let match;
    const requestRegex = new RegExp(REQUEST_MARKER_REGEX.source, 'g');
    while ((match = requestRegex.exec(fullText)) !== null) {
      const targetName = match[1];
      const question = match[2];
      const targetRole = nameToRole[targetName];
      if (targetRole && rerunDepth < MAX_RERUN_DEPTH) {
        requests.push({ targetRole, question });
      }
    }

    // 7. Store result in working memory + short-term memory
    deps.workingMemory.set(agentRole, `task_result_${task.id}`, fullText);

    deps.shortTermStore.store({
      companyId: deps.companyId,
      agentRole,
      topic: 'cycle_task',
      content: `Task: ${task.description}\nResult: ${fullText.slice(0, 2000)}`,
      memoryType: 'task_result',
    });

    // 8. Emit done
    onEvent({
      type: 'agent_done',
      cycleId: task.cycleId,
      taskId: task.id,
      agentRole,
      agentName,
      content: fullText,
      timestamp: new Date().toISOString(),
    });

    if (requests.length > 0) {
      deps.workingMemory.set(agentRole, `pending_requests_${task.id}`, requests);
      deps.workingMemory.set(agentRole, `partial_result_${task.id}`, fullText);

      return {
        status: 'needs_data',
        result: fullText,
        requests,
        tokensUsed: totalInputTokens + totalOutputTokens,
        costUsd: totalCost,
      };
    }

    return {
      status: 'completed',
      result: fullText,
      requests: [],
      tokensUsed: totalInputTokens + totalOutputTokens,
      costUsd: totalCost,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    onEvent({
      type: 'error',
      cycleId: task.cycleId,
      taskId: task.id,
      agentRole,
      agentName,
      content: errorMessage,
      timestamp: new Date().toISOString(),
    });

    return {
      status: 'failed',
      result: '',
      requests: [],
      tokensUsed: 0,
      costUsd: 0,
    };
  }
}

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
import { processSEOMarkers } from '../seo/processor';
import { parseBudgetChangeMarkers, processBudgetChange } from '../ads/budget-manager';

const REQUEST_MARKER_REGEX = /\[REQUEST:\s*(\w+)\s*\|\s*(.+?)\]/g;
const BLOCKED_MARKER_REGEX = /\[BLOCKED:\s*(.+?)\]/g;
const CRAWL_URL_MARKER_REGEX = /\[CRAWL_URL:\s*(.+?)\]/g;
const BUDGET_CHANGE_MARKER_REGEX = /\[BUDGET_CHANGE:\s*({.+?})\]/g;
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

    // 7. Check for [BLOCKED:] markers — human input needed
    let blockedQuestion: string | null = null;
    const blockedRegex = new RegExp(BLOCKED_MARKER_REGEX.source, 'g');
    const blockedMatch = blockedRegex.exec(fullText);
    if (blockedMatch) {
      blockedQuestion = blockedMatch[1];

      // Persist to DB
      deps.supabase
        .from('cycle_tasks')
        .update({
          needs_human_input: true,
          human_input_question: blockedQuestion,
          status: 'needs_data',
        })
        .eq('id', task.id)
        .then(() => {});

      onEvent({
        type: 'human_input_needed',
        cycleId: task.cycleId,
        taskId: task.id,
        agentRole,
        agentName,
        content: blockedQuestion,
        timestamp: new Date().toISOString(),
      });
    }

    // 7a. SEO-specific: Check for [CRAWL_URL:] markers
    if (agentRole === 'seo' && rerunDepth < MAX_RERUN_DEPTH) {
      const hasCrawlMarkers = CRAWL_URL_MARKER_REGEX.test(fullText);
      if (hasCrawlMarkers) {
        try {
          const seoResult = await processSEOMarkers(
            fullText,
            deps.companyId,
            task.cycleId,
            deps.supabase
          );

          if (seoResult.crawlsPerformed > 0) {
            // Re-run task with crawl data injected
            const newInjected = new Map(injectedResponses || []);
            newInjected.set('__seo_crawl_data__', seoResult.injectedContext);

            return runTask(task, deps, onEvent, newInjected, rerunDepth + 1);
          }
        } catch (err) {
          console.error('SEO marker processing failed:', err);
        }
      }
    }

    // 7b. Ads-specific: Check for [BUDGET_CHANGE:] markers
    if (agentRole === 'ads') {
      const budgetRequests = parseBudgetChangeMarkers(fullText);
      for (const request of budgetRequests) {
        try {
          const result = await processBudgetChange(
            request,
            deps.companyId,
            task.id,
            deps.supabase
          );

          if (result.requiresHuman && !blockedQuestion) {
            // Budget approval requires human input — already handled by processBudgetChange
            blockedQuestion = `Budget change requires approval: ${result.message}`;
          }
        } catch (err) {
          console.error('Budget change processing failed:', err);
        }
      }
    }

    // 8. Store result in working memory + short-term memory
    deps.workingMemory.set(agentRole, `task_result_${task.id}`, fullText);

    deps.shortTermStore.store({
      companyId: deps.companyId,
      agentRole,
      topic: 'cycle_task',
      content: `Task: ${task.description}\nResult: ${fullText.slice(0, 2000)}`,
      memoryType: 'task_result',
    });

    // 9. Extract artifacts from completed task results
    if (!blockedQuestion && requests.length === 0 && fullText.length > 200) {
      extractAndStoreArtifact(task, agentRole, agentName, fullText, deps).catch((err) =>
        console.error('Artifact extraction failed:', err)
      );
    }

    // 10. Emit done
    onEvent({
      type: 'agent_done',
      cycleId: task.cycleId,
      taskId: task.id,
      agentRole,
      agentName,
      content: fullText,
      timestamp: new Date().toISOString(),
    });

    if (blockedQuestion) {
      return {
        status: 'needs_data',
        result: fullText,
        requests: [],
        tokensUsed: totalInputTokens + totalOutputTokens,
        costUsd: totalCost,
      };
    }

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

// --- Artifact extraction ---

const ARTIFACT_INDICATORS = [
  /```[\s\S]{50,}```/,          // Code blocks with substantial content
  /#{1,3}\s+.+\n/,              // Markdown headings (strategy docs, reports)
  /\b(strategy|plan|analysis|report|draft|proposal|recommendation)\b/i,
  /\d+\.\s+.+\n/,              // Numbered lists (action plans)
];

type ArtifactTypeValue = 'report' | 'code' | 'strategy' | 'content' | 'analysis' | 'email_draft' | 'other';

function detectArtifactType(text: string, agentRole: AgentRole): { type: ArtifactTypeValue; hasArtifact: boolean } {
  const matchCount = ARTIFACT_INDICATORS.filter((r) => r.test(text)).length;
  if (matchCount < 2 && text.length < 500) return { type: 'other', hasArtifact: false };

  const roleTypeMap: Partial<Record<AgentRole, ArtifactTypeValue>> = {
    engineer: 'code',
    'data-analyst': 'analysis',
    marketing: 'content',
    sales: 'email_draft',
    ceo: 'strategy',
    growth: 'strategy',
    product: 'report',
    operations: 'report',
    support: 'report',
    'customer-success': 'report',
    seo: 'analysis',
    ads: 'strategy',
  };

  return { type: roleTypeMap[agentRole] || 'other', hasArtifact: true };
}

async function extractAndStoreArtifact(
  task: CycleTask,
  agentRole: AgentRole,
  agentName: string,
  fullText: string,
  deps: TaskRunnerDeps
): Promise<void> {
  const { type, hasArtifact } = detectArtifactType(fullText, agentRole);
  if (!hasArtifact) return;

  // Generate title and preview from the result
  const firstHeading = fullText.match(/^#{1,3}\s+(.+)/m);
  const title = firstHeading
    ? firstHeading[1].slice(0, 120)
    : `${agentName}: ${task.description.slice(0, 100)}`;
  const preview = fullText
    .replace(/```[\s\S]*?```/g, '[code block]')
    .replace(/#{1,3}\s+/g, '')
    .slice(0, 200)
    .trim();

  await deps.supabase.from('artifacts').insert({
    company_id: deps.companyId,
    cycle_id: task.cycleId,
    task_id: task.id,
    agent_role: agentRole,
    agent_name: agentName,
    title,
    type,
    content: fullText.slice(0, 50000),
    preview,
  });

  // Also insert milestone activity for the feed
  await deps.supabase.from('agent_activities').insert({
    company_id: deps.companyId,
    agent_role: agentRole,
    agent_name: agentName,
    action: `Produced ${type}: ${title}`,
    detail: preview,
    type: 'milestone',
  });
}

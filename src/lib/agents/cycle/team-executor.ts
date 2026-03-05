/**
 * Team Executor Module
 *
 * Orchestrates parallel execution of 2-4 agents working on a shared task.
 * Handles atomic credit reservation, parallel execution, and result merging.
 *
 * @module team-executor
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentRole, CycleTask, CycleStreamEvent, TeamTaskConfig, TeamTaskResult } from '../../types';
import { AGENT_NAMES } from '../engine';
import { runTask, type TaskRunnerDeps } from './task-runner';
import { createCreditManager } from '../../credits/manager';
import { mergeResults } from './merge-strategies';
import { v4 as uuid } from 'uuid';

/** Default team composition for /team command */
export const DEFAULT_TEAM: AgentRole[] = ['ceo', 'marketing', 'sales', 'seo'];

/** Default team names for display */
export const DEFAULT_TEAM_NAMES = {
  ceo: 'Atlas',
  marketing: 'Echo',
  sales: 'Arrow',
  seo: 'Scout',
} as const;

/** Team task execution timeout (10 minutes) */
const TEAM_TIMEOUT_MS = 600_000;

/** Individual agent timeout within team (2 minutes) */
const AGENT_TIMEOUT_MS = 120_000;

/**
 * Execute a team task with multiple agents working in parallel.
 *
 * Flow:
 * 1. Reserve credits atomically for all agents
 * 2. Create team_task record
 * 3. Run all agents in parallel via Promise.allSettled
 * 4. Handle partial failures (refund failed agents)
 * 5. Merge results using specified strategy
 * 6. Finalize and return combined result
 *
 * @param cycleId - Operating cycle ID
 * @param companyId - Company ID for credit charging
 * @param config - Team task configuration
 * @param deps - Task runner dependencies
 * @param supabase - Supabase client
 * @param onEvent - SSE event callback
 * @returns Team task result with merged output
 */
export async function executeTeamTask(
  cycleId: string,
  companyId: string,
  config: TeamTaskConfig,
  deps: TaskRunnerDeps,
  supabase: SupabaseClient,
  onEvent: (event: CycleStreamEvent) => void
): Promise<TeamTaskResult> {
  const teamTaskId = uuid();
  const creditManager = createCreditManager(supabase);
  const startedAt = new Date().toISOString();

  // Emit team task started event
  onEvent({
    type: 'team_task_started',
    cycleId,
    teamTaskId,
    content: `Team task started with ${config.agents.length} agents`,
    agents: config.agents,
    timestamp: startedAt,
  });

  // 1. Reserve credits atomically for all agents
  const reservation = await creditManager.reserveCreditsForTeam(
    companyId,
    teamTaskId,
    config.agents
  );

  if (!reservation.success) {
    onEvent({
      type: 'error',
      cycleId,
      content: reservation.error || 'Failed to reserve credits for team',
      timestamp: new Date().toISOString(),
    });

    return {
      teamTaskId,
      status: 'failed',
      error: reservation.error || 'Insufficient credits',
      agentResults: [],
      mergedResult: null,
      creditsUsed: 0,
    };
  }

  // 2. Create team_task record in database
  await supabase.from('team_tasks').insert({
    id: teamTaskId,
    cycle_id: cycleId,
    company_id: companyId,
    description: config.description,
    agent_roles: config.agents,
    status: 'running',
    credits_reserved: reservation.reserved,
    merge_strategy: config.mergeStrategy,
    started_at: startedAt,
  });

  // 3. Create individual CycleTask objects for each agent
  const tasks: CycleTask[] = config.agents.map((role) => ({
    id: uuid(),
    cycleId,
    agentRole: role,
    agentName: AGENT_NAMES[role] || role,
    description: buildAgentPrompt(config.description, role, config.agents),
    status: 'pending' as const,
    result: null,
    dependsOn: [],
    tokensUsed: 0,
    costUsd: 0,
    needsHumanInput: false,
    humanInputQuestion: null,
    humanInputResponse: null,
    humanInputRespondedAt: null,
    startedAt: null,
    completedAt: null,
    error: null,
  }));

  // Insert tasks linked to team_task
  await supabase.from('cycle_tasks').insert(
    tasks.map((t) => ({
      id: t.id,
      cycle_id: cycleId,
      company_id: companyId,
      agent_role: t.agentRole,
      agent_name: t.agentName,
      description: t.description,
      status: 'running',
      depends_on: [],
      team_task_id: teamTaskId,
    }))
  );

  // 4. Execute all agents in parallel with timeout
  const agentResults: { role: AgentRole; status: 'success' | 'failed'; result: string; error?: string }[] = [];

  const results = await Promise.allSettled(
    tasks.map(async (task) => {
      // Emit agent started
      onEvent({
        type: 'task_status',
        cycleId,
        taskId: task.id,
        agentRole: task.agentRole,
        agentName: task.agentName,
        status: 'running',
        timestamp: new Date().toISOString(),
      });

      // Run with timeout
      const result = await Promise.race([
        runTask(task, deps, onEvent),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Agent timeout')), AGENT_TIMEOUT_MS)
        ),
      ]);

      return { task, result };
    })
  );

  // 5. Process results and track failures
  const failedRoles: AgentRole[] = [];

  for (const settledResult of results) {
    if (settledResult.status === 'fulfilled') {
      const { task, result } = settledResult.value;

      if (result.status === 'completed') {
        agentResults.push({
          role: task.agentRole,
          status: 'success',
          result: result.result,
        });

        // Update task in database
        await supabase.from('cycle_tasks').update({
          status: 'completed',
          result: result.result?.slice(0, 50000),
          completed_at: new Date().toISOString(),
          tokens_used: result.tokensUsed,
          cost_usd: result.costUsd,
        }).eq('id', task.id);

        onEvent({
          type: 'agent_done',
          cycleId,
          taskId: task.id,
          agentRole: task.agentRole,
          agentName: task.agentName,
          content: result.result,
          timestamp: new Date().toISOString(),
        });
      } else {
        failedRoles.push(task.agentRole);
        agentResults.push({
          role: task.agentRole,
          status: 'failed',
          result: '',
          error: result.result || 'Task failed',
        });

        await supabase.from('cycle_tasks').update({
          status: 'failed',
          error: result.result || 'Task failed',
          completed_at: new Date().toISOString(),
        }).eq('id', task.id);
      }
    } else {
      // Promise rejected (timeout or unexpected error)
      const task = tasks.find((t) =>
        !agentResults.some((r) => r.role === t.agentRole)
      );

      if (task) {
        failedRoles.push(task.agentRole);
        agentResults.push({
          role: task.agentRole,
          status: 'failed',
          result: '',
          error: settledResult.reason?.message || 'Unexpected error',
        });

        await supabase.from('cycle_tasks').update({
          status: 'failed',
          error: settledResult.reason?.message || 'Unexpected error',
          completed_at: new Date().toISOString(),
        }).eq('id', task.id);
      }
    }
  }

  // 6. Refund credits for failed agents
  if (failedRoles.length > 0) {
    await creditManager.refundTeamCredits(companyId, teamTaskId, failedRoles);

    onEvent({
      type: 'team_task_partial_failure',
      cycleId,
      teamTaskId,
      content: `${failedRoles.length} agent(s) failed: ${failedRoles.join(', ')}. Credits refunded.`,
      timestamp: new Date().toISOString(),
    });
  }

  // 7. Check if any agents succeeded
  const successfulResults = agentResults.filter((r) => r.status === 'success');

  if (successfulResults.length === 0) {
    await supabase.from('team_tasks').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
    }).eq('id', teamTaskId);

    return {
      teamTaskId,
      status: 'failed',
      error: 'All agents failed',
      agentResults,
      mergedResult: null,
      creditsUsed: 0, // All refunded
    };
  }

  // 8. Update status to merging
  await supabase.from('team_tasks').update({ status: 'merging' }).eq('id', teamTaskId);

  onEvent({
    type: 'team_task_merging',
    cycleId,
    teamTaskId,
    content: `Merging results from ${successfulResults.length} agents...`,
    timestamp: new Date().toISOString(),
  });

  // 9. Merge results using specified strategy
  const mergedResult = await mergeResults(
    config.description,
    successfulResults.map((r) => ({ role: r.role, result: r.result })),
    config.mergeStrategy,
    deps
  );

  // 10. Finalize team task
  const completedAt = new Date().toISOString();

  await supabase.from('team_tasks').update({
    status: 'completed',
    merged_result: mergedResult.slice(0, 100000),
    completed_at: completedAt,
  }).eq('id', teamTaskId);

  onEvent({
    type: 'team_task_completed',
    cycleId,
    teamTaskId,
    content: mergedResult,
    timestamp: completedAt,
  });

  return {
    teamTaskId,
    status: 'completed',
    agentResults,
    mergedResult,
    creditsUsed: reservation.reserved - (failedRoles.length * 10), // Approximate
  };
}

/**
 * Build a specialized prompt for each agent in the team.
 * Adds context about the team collaboration.
 *
 * @param baseDescription - The original task description
 * @param role - The agent's role
 * @param teamRoles - All roles in the team
 * @returns Customized prompt for the agent
 */
function buildAgentPrompt(
  baseDescription: string,
  role: AgentRole,
  teamRoles: AgentRole[]
): string {
  const otherAgents = teamRoles
    .filter((r) => r !== role)
    .map((r) => AGENT_NAMES[r])
    .join(', ');

  const roleInstructions: Record<AgentRole, string> = {
    ceo: 'Provide strategic direction and coordinate the overall approach. Focus on high-level decisions and priorities.',
    marketing: 'Focus on content strategy, messaging, and audience engagement. Create compelling marketing angles.',
    sales: 'Develop outreach strategies, email sequences, and conversion tactics. Focus on lead generation.',
    seo: 'Optimize for search visibility and discoverability. Focus on keywords, content structure, and technical SEO.',
    engineer: 'Focus on technical implementation and architecture decisions.',
    growth: 'Focus on growth metrics, viral loops, and user acquisition strategies.',
    product: 'Focus on product features, user experience, and roadmap priorities.',
    operations: 'Focus on processes, efficiency, and operational excellence.',
    support: 'Focus on customer needs, pain points, and support strategies.',
    'data-analyst': 'Focus on data insights, metrics analysis, and evidence-based recommendations.',
    'customer-success': 'Focus on customer retention, onboarding, and satisfaction.',
    ads: 'Focus on paid advertising strategy, budget allocation, and campaign optimization.',
  };

  return `${baseDescription}

[TEAM CONTEXT]
You are working as part of a team with: ${otherAgents}
Your specific focus: ${roleInstructions[role] || 'Contribute your expertise to this task.'}

Provide your unique perspective and actionable output. Your response will be merged with other team members' outputs.`;
}

/**
 * Detect if a directive should trigger team execution.
 * Checks for complexity indicators or explicit /team command.
 *
 * @param directive - The user's directive
 * @returns Whether to use team execution
 */
export function shouldUseTeam(directive: string): boolean {
  // Explicit /team command
  if (directive.toLowerCase().startsWith('/team ')) {
    return true;
  }

  // Complexity indicators that suggest team execution
  const complexityIndicators = [
    /go.to.market/i,
    /launch\s+strategy/i,
    /comprehensive\s+(plan|strategy|analysis)/i,
    /full\s+(marketing|growth|sales)\s+plan/i,
    /cross.functional/i,
    /end.to.end/i,
    /complete\s+(strategy|roadmap)/i,
  ];

  return complexityIndicators.some((pattern) => pattern.test(directive));
}

/**
 * Parse the /team command and extract the directive.
 *
 * @param input - Raw user input
 * @returns Cleaned directive without the /team prefix
 */
export function parseTeamCommand(input: string): string {
  if (input.toLowerCase().startsWith('/team ')) {
    return input.slice(6).trim();
  }
  return input;
}

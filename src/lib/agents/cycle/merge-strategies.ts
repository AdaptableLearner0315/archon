/**
 * Merge Strategies Module
 *
 * Provides different strategies for combining outputs from multiple agents
 * working on the same task in parallel.
 *
 * @module merge-strategies
 */

import type { AgentRole } from '../../types';
import { ClaudeClient } from '../claude-client';
import { AGENT_NAMES } from '../engine';
import type { TaskRunnerDeps } from './task-runner';

/** Supported merge strategies */
export type MergeStrategy = 'concatenate' | 'synthesize' | 'vote';

/** Agent result for merging */
interface AgentOutput {
  role: AgentRole;
  result: string;
}

/**
 * Merge results from multiple agents using the specified strategy.
 *
 * @param taskDescription - Original task description
 * @param outputs - Array of agent outputs
 * @param strategy - Merge strategy to use
 * @param deps - Task runner dependencies (for Claude access)
 * @returns Merged result string
 */
export async function mergeResults(
  taskDescription: string,
  outputs: AgentOutput[],
  strategy: MergeStrategy,
  deps: TaskRunnerDeps
): Promise<string> {
  switch (strategy) {
    case 'concatenate':
      return concatenateResults(outputs);
    case 'synthesize':
      return synthesizeResults(taskDescription, outputs);
    case 'vote':
      return voteResults(taskDescription, outputs);
    default:
      return synthesizeResults(taskDescription, outputs);
  }
}

/**
 * Concatenate strategy: Combine outputs with clear headers.
 * Best for: Quick, transparent view of all perspectives.
 *
 * @param outputs - Agent outputs to concatenate
 * @returns Combined output with headers
 */
function concatenateResults(outputs: AgentOutput[]): string {
  const sections = outputs.map(({ role, result }) => {
    const agentName = AGENT_NAMES[role] || role;
    return `## ${agentName}'s Contribution\n\n${result}`;
  });

  return `# Team Results\n\n${sections.join('\n\n---\n\n')}`;
}

/**
 * Synthesize strategy: Use Claude to combine best insights into unified output.
 * Best for: Coherent, actionable deliverables.
 *
 * @param taskDescription - Original task
 * @param outputs - Agent outputs to synthesize
 * @returns Unified synthesized output
 */
async function synthesizeResults(
  taskDescription: string,
  outputs: AgentOutput[]
): Promise<string> {
  const agentContributions = outputs.map(({ role, result }) => {
    const agentName = AGENT_NAMES[role] || role;
    return `### ${agentName} (${role})\n${result}`;
  }).join('\n\n');

  const synthesisPrompt = `You are synthesizing outputs from a team of AI agents who worked on the same task in parallel.

## Original Task
${taskDescription}

## Agent Contributions
${agentContributions}

## Your Task
Create a unified, coherent response that:
1. Combines the best insights from all agents
2. Resolves any contradictions by choosing the most well-reasoned approach
3. Eliminates redundancy while preserving unique value
4. Presents a single, actionable output the user can act on immediately
5. Maintains a professional, confident tone

Do NOT simply list what each agent said. Create a synthesized deliverable that represents the collective intelligence of the team.`;

  let synthesized = '';

  for await (const chunk of ClaudeClient.stream({
    useCase: 'inter_agent',
    system: 'You are a synthesis agent. Combine multiple perspectives into one cohesive output.',
    messages: [{ role: 'user', content: synthesisPrompt }],
  })) {
    if (chunk.type === 'text') {
      synthesized += chunk.content;
    }
  }

  return synthesized || concatenateResults(outputs);
}

/**
 * Vote strategy: Present all views and identify consensus.
 * Best for: Decision-making with diverse input.
 *
 * @param taskDescription - Original task
 * @param outputs - Agent outputs to analyze
 * @returns Analysis with consensus identification
 */
async function voteResults(
  taskDescription: string,
  outputs: AgentOutput[]
): Promise<string> {
  const agentContributions = outputs.map(({ role, result }) => {
    const agentName = AGENT_NAMES[role] || role;
    return `### ${agentName}\n${result}`;
  }).join('\n\n');

  const votePrompt = `You are analyzing outputs from a team of AI agents to identify consensus and disagreements.

## Original Task
${taskDescription}

## Agent Responses
${agentContributions}

## Your Analysis
Provide:
1. **Consensus Points**: What do all agents agree on?
2. **Divergent Views**: Where do agents disagree? Present each perspective fairly.
3. **Recommended Path**: Based on the collective input, what's the best course of action?
4. **Confidence Level**: How confident is this recommendation (High/Medium/Low)?

Format as a clear decision brief.`;

  let analysis = '';

  for await (const chunk of ClaudeClient.stream({
    useCase: 'inter_agent',
    system: 'You are a decision analyst. Identify consensus and make recommendations.',
    messages: [{ role: 'user', content: votePrompt }],
  })) {
    if (chunk.type === 'text') {
      analysis += chunk.content;
    }
  }

  return analysis || concatenateResults(outputs);
}

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentRole, AgentPerformanceRecord, CycleTask } from '../../types';
import { ClaudeClient } from '../claude-client';

const WEIGHT_COMPLETION = 0.4;
const WEIGHT_SPEED = 0.2;
const WEIGHT_EFFICIENCY = 0.2;
const WEIGHT_QUALITY = 0.2;

const TASK_TIMEOUT_MS = 60_000;

export function scoreTask(task: CycleTask): number {
  const completionScore = task.status === 'completed' ? 100 : 0;

  let speedScore = 50;
  if (task.startedAt && task.completedAt) {
    const duration = new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime();
    speedScore = Math.max(0, Math.min(100, 100 - (duration / TASK_TIMEOUT_MS) * 100));
  }

  const efficiencyScore = Math.max(0, Math.min(100, 100 - (task.tokensUsed / 8192) * 100));

  let qualityScore = 50;
  if (task.result) {
    const hasStructure = /#{1,3}\s|[-*]\s|\d+\.\s|```/.test(task.result);
    const lengthScore = Math.min(100, (task.result.length / 2000) * 100);
    qualityScore = hasStructure ? Math.min(100, lengthScore + 20) : lengthScore;
  }

  return Math.round(
    completionScore * WEIGHT_COMPLETION +
    speedScore * WEIGHT_SPEED +
    efficiencyScore * WEIGHT_EFFICIENCY +
    qualityScore * WEIGHT_QUALITY
  );
}

export async function scoreAgentInCycle(
  companyId: string,
  cycleId: string,
  agentRole: AgentRole,
  tasks: CycleTask[],
  supabase: SupabaseClient
): Promise<AgentPerformanceRecord> {
  const agentTasks = tasks.filter((t) => t.agentRole === agentRole);
  const completed = agentTasks.filter((t) => t.status === 'completed');
  const failed = agentTasks.filter((t) => t.status === 'failed' || t.status === 'blocked');

  const taskScores = agentTasks.map(scoreTask);
  const avgScore = taskScores.length > 0
    ? taskScores.reduce((a, b) => a + b, 0) / taskScores.length
    : 0;

  const totalTokens = agentTasks.reduce((sum, t) => sum + t.tokensUsed, 0);
  const totalCost = agentTasks.reduce((sum, t) => sum + t.costUsd, 0);

  const record: AgentPerformanceRecord = {
    id: '',
    companyId,
    cycleId,
    agentRole,
    tasksCompleted: completed.length,
    tasksFailed: failed.length,
    avgQualityScore: Math.round(avgScore),
    totalTokensUsed: totalTokens,
    totalCostUsd: totalCost,
    score: Math.round(avgScore),
    createdAt: new Date().toISOString(),
  };

  const { data } = await supabase
    .from('agent_performance')
    .insert({
      company_id: companyId,
      cycle_id: cycleId,
      agent_role: agentRole,
      tasks_completed: record.tasksCompleted,
      tasks_failed: record.tasksFailed,
      avg_quality_score: record.avgQualityScore,
      total_tokens_used: record.totalTokensUsed,
      total_cost_usd: record.totalCostUsd,
      score: record.score,
    })
    .select()
    .single();

  if (data) record.id = data.id;

  return record;
}

export async function getAgentTrend(
  companyId: string,
  agentRole: AgentRole,
  lastN: number,
  supabase: SupabaseClient
): Promise<{ scores: number[]; trend: 'improving' | 'declining' | 'stable' }> {
  const { data } = await supabase
    .from('agent_performance')
    .select('score')
    .eq('company_id', companyId)
    .eq('agent_role', agentRole)
    .order('created_at', { ascending: false })
    .limit(lastN);

  const scores = (data || []).map((d) => d.score as number).reverse();

  if (scores.length < 2) return { scores, trend: 'stable' };

  const mid = Math.floor(scores.length / 2);
  const firstAvg = scores.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
  const secondAvg = scores.slice(mid).reduce((a, b) => a + b, 0) / (scores.length - mid);

  const diff = secondAvg - firstAvg;
  const trend = diff > 5 ? 'improving' : diff < -5 ? 'declining' : 'stable';

  return { scores, trend };
}

export async function detectPatterns(
  companyId: string,
  agentRole: AgentRole,
  supabase: SupabaseClient
): Promise<string> {
  const { data: recentPerf } = await supabase
    .from('agent_performance')
    .select('*')
    .eq('company_id', companyId)
    .eq('agent_role', agentRole)
    .order('created_at', { ascending: false })
    .limit(5);

  const { data: recentTasks } = await supabase
    .from('cycle_tasks')
    .select('description, status, error, tokens_used')
    .eq('company_id', companyId)
    .eq('agent_role', agentRole)
    .order('created_at', { ascending: false })
    .limit(10);

  if (!recentPerf?.length) return 'Insufficient data for pattern detection.';

  const result = await ClaudeClient.call({
    useCase: 'memory_condensation',
    system: `Analyze the performance data for the ${agentRole} agent. Identify:
1. Recurring patterns (failures, successes)
2. Areas where the agent consistently underperforms
3. Suggested improvements
Be concise (3-5 bullet points).`,
    messages: [{ role: 'user', content: JSON.stringify({ performance: recentPerf, tasks: recentTasks }) }],
  });

  return result.text;
}

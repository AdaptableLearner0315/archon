import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AgentRole,
  ReflectionRecommendation,
  RecommendationCriticality,
  RecommendationCategory,
  AgentPerformanceRecord,
  CycleTask,
  LongTermMemory,
} from '../../types';
import { v4 as uuid } from 'uuid';

interface PerformanceMetrics {
  agentPerformance: AgentPerformanceRecord[];
  recentTasks: CycleTask[];
  longTermMemories: LongTermMemory[];
  kpiData: Record<string, { current: number; previous: number }>;
}

export async function gatherPerformanceMetrics(
  companyId: string,
  daysBack: number,
  supabase: SupabaseClient
): Promise<PerformanceMetrics> {
  const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: agentPerformance },
    { data: recentTasks },
    { data: longTermMemories },
    { data: recentMetrics },
    { data: previousMetrics },
  ] = await Promise.all([
    supabase
      .from('agent_performance')
      .select('*')
      .eq('company_id', companyId)
      .gte('created_at', cutoffDate)
      .order('created_at', { ascending: false }),
    supabase
      .from('cycle_tasks')
      .select('*')
      .eq('company_id', companyId)
      .gte('created_at', cutoffDate)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('agent_memory_long_term')
      .select('*')
      .eq('company_id', companyId)
      .order('last_referenced_at', { ascending: false })
      .limit(20),
    supabase
      .from('metrics')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('metrics')
      .select('*')
      .eq('company_id', companyId)
      .lt('created_at', cutoffDate)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  const kpiData: Record<string, { current: number; previous: number }> = {};

  if (recentMetrics?.[0]) {
    const current = recentMetrics[0];
    const previous = previousMetrics?.[0] || current;

    kpiData.revenue = { current: Number(current.revenue) || 0, previous: Number(previous.revenue) || 0 };
    kpiData.users = { current: current.users_count || 0, previous: previous.users_count || 0 };
    kpiData.signups = { current: current.signups_today || 0, previous: previous.signups_today || 0 };
    kpiData.churn = { current: Number(current.churn_rate) || 0, previous: Number(previous.churn_rate) || 0 };
    kpiData.conversion = { current: Number(current.conversion_rate) || 0, previous: Number(previous.conversion_rate) || 0 };
    kpiData.nps = { current: Number(current.nps_score) || 0, previous: Number(previous.nps_score) || 0 };
  }

  return {
    agentPerformance: (agentPerformance || []).map(mapAgentPerformance),
    recentTasks: (recentTasks || []).map(mapCycleTask),
    longTermMemories: (longTermMemories || []).map(mapLongTermMemory),
    kpiData,
  };
}

function mapAgentPerformance(row: Record<string, unknown>): AgentPerformanceRecord {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    cycleId: row.cycle_id as string,
    agentRole: row.agent_role as AgentRole,
    tasksCompleted: (row.tasks_completed as number) || 0,
    tasksFailed: (row.tasks_failed as number) || 0,
    avgQualityScore: Number(row.avg_quality_score) || 0,
    totalTokensUsed: (row.total_tokens_used as number) || 0,
    totalCostUsd: Number(row.total_cost_usd) || 0,
    score: Number(row.score) || 0,
    createdAt: row.created_at as string,
  };
}

function mapCycleTask(row: Record<string, unknown>): CycleTask {
  return {
    id: row.id as string,
    cycleId: row.cycle_id as string,
    agentRole: row.agent_role as AgentRole,
    agentName: row.agent_name as string,
    description: row.description as string,
    status: row.status as CycleTask['status'],
    result: row.result as string | null,
    dependsOn: (row.depends_on as string[]) || [],
    tokensUsed: (row.tokens_used as number) || 0,
    costUsd: Number(row.cost_usd) || 0,
    needsHumanInput: (row.needs_human_input as boolean) || false,
    humanInputQuestion: row.human_input_question as string | null,
    humanInputResponse: row.human_input_response as string | null,
    humanInputRespondedAt: row.human_input_responded_at as string | null,
    startedAt: row.started_at as string | null,
    completedAt: row.completed_at as string | null,
    error: row.error as string | null,
  };
}

function mapLongTermMemory(row: Record<string, unknown>): LongTermMemory {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    agentRole: row.agent_role as AgentRole,
    category: row.category as LongTermMemory['category'],
    summary: row.summary as string,
    confidence: Number(row.confidence) || 0,
    timesReferenced: (row.times_referenced as number) || 0,
    lastReferencedAt: row.last_referenced_at as string,
    createdAt: row.created_at as string,
  };
}

export function buildReflectionContext(metrics: PerformanceMetrics): string {
  const lines: string[] = ['## Performance Data'];

  // KPI summary
  lines.push('\n### KPI Changes');
  for (const [key, data] of Object.entries(metrics.kpiData)) {
    const change = data.current - data.previous;
    const changePercent = data.previous !== 0 ? ((change / data.previous) * 100).toFixed(1) : '0';
    lines.push(`- ${key}: ${data.previous} -> ${data.current} (${change >= 0 ? '+' : ''}${changePercent}%)`);
  }

  // Agent performance summary
  lines.push('\n### Agent Performance');
  const agentScores = new Map<string, { total: number; count: number; completed: number; failed: number }>();
  for (const perf of metrics.agentPerformance) {
    const existing = agentScores.get(perf.agentRole) || { total: 0, count: 0, completed: 0, failed: 0 };
    existing.total += perf.score;
    existing.count += 1;
    existing.completed += perf.tasksCompleted;
    existing.failed += perf.tasksFailed;
    agentScores.set(perf.agentRole, existing);
  }
  for (const [role, data] of agentScores) {
    const avgScore = data.count > 0 ? (data.total / data.count).toFixed(0) : '0';
    lines.push(`- ${role}: avg score ${avgScore}, ${data.completed} completed, ${data.failed} failed`);
  }

  // Recent task summary
  lines.push('\n### Recent Tasks');
  const tasksByStatus = {
    completed: metrics.recentTasks.filter((t) => t.status === 'completed').length,
    failed: metrics.recentTasks.filter((t) => t.status === 'failed').length,
    blocked: metrics.recentTasks.filter((t) => t.status === 'blocked').length,
  };
  lines.push(`- Completed: ${tasksByStatus.completed}`);
  lines.push(`- Failed: ${tasksByStatus.failed}`);
  lines.push(`- Blocked: ${tasksByStatus.blocked}`);

  // Failed tasks detail
  const failedTasks = metrics.recentTasks.filter((t) => t.status === 'failed').slice(0, 5);
  if (failedTasks.length > 0) {
    lines.push('\n### Failed Tasks (Recent)');
    for (const task of failedTasks) {
      lines.push(`- ${task.agentRole}: ${task.description.slice(0, 80)} - ${task.error?.slice(0, 50) || 'Unknown error'}`);
    }
  }

  // Long-term insights
  if (metrics.longTermMemories.length > 0) {
    lines.push('\n### Long-term Insights');
    for (const mem of metrics.longTermMemories.slice(0, 5)) {
      lines.push(`- [${mem.category}] ${mem.summary.slice(0, 100)}`);
    }
  }

  return lines.join('\n');
}

export function createFallbackRecommendations(metrics: PerformanceMetrics): ReflectionRecommendation[] {
  const recommendations: ReflectionRecommendation[] = [];

  // Check for high failure rate
  const totalTasks = metrics.recentTasks.length;
  const failedTasks = metrics.recentTasks.filter((t) => t.status === 'failed').length;
  const failureRate = totalTasks > 0 ? failedTasks / totalTasks : 0;

  if (failureRate > 0.2) {
    recommendations.push(createRecommendation(
      'critical',
      'operations',
      'Investigate high task failure rate',
      `${(failureRate * 100).toFixed(0)}% of recent tasks failed, indicating potential system issues or misconfiguration.`,
      'engineer',
      'Review failed task logs and identify root causes for the elevated failure rate.',
      'Reduce failure rate to under 5%'
    ));
  }

  // Check for churn increase
  const churnData = metrics.kpiData.churn;
  if (churnData && churnData.current > churnData.previous * 1.1) {
    recommendations.push(createRecommendation(
      'high',
      'retention',
      'Address rising churn rate',
      `Churn increased from ${churnData.previous}% to ${churnData.current}%, requiring immediate retention efforts.`,
      'customer-success',
      'Identify at-risk accounts and initiate proactive outreach with retention offers.',
      'Reduce churn back to previous levels'
    ));
  }

  // Check for revenue decline
  const revenueData = metrics.kpiData.revenue;
  if (revenueData && revenueData.current < revenueData.previous * 0.95) {
    recommendations.push(createRecommendation(
      'critical',
      'revenue',
      'Reverse revenue decline',
      `Revenue dropped from $${revenueData.previous} to $${revenueData.current}, requiring immediate sales focus.`,
      'sales',
      'Accelerate pipeline deals and launch re-engagement campaign for dormant accounts.',
      'Restore revenue to previous levels'
    ));
  }

  // Suggest growth if metrics are stable
  if (recommendations.length === 0) {
    const signupData = metrics.kpiData.signups;
    if (signupData && signupData.current >= signupData.previous) {
      recommendations.push(createRecommendation(
        'medium',
        'growth',
        'Capitalize on growth momentum',
        'Metrics are stable or improving. Opportunity to accelerate growth initiatives.',
        'growth',
        'Launch A/B tests on conversion funnel and explore new acquisition channels.',
        'Increase signups by 20%'
      ));
    }
  }

  return recommendations;
}

function createRecommendation(
  criticality: RecommendationCriticality,
  category: RecommendationCategory,
  title: string,
  reasoning: string,
  agentRole: AgentRole,
  directive: string,
  estimatedImpact: string
): ReflectionRecommendation {
  return {
    id: uuid(),
    criticality,
    category,
    title,
    reasoning,
    suggestedAction: {
      description: directive,
      agentRole,
      directive,
      estimatedImpact,
    },
    triggerEnabled: true,
  };
}

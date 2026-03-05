/**
 * Memory Reflection Engine
 *
 * Analyzes memory system performance and generates improvement recommendations.
 * This is the meta-cognitive layer - the memory system analyzing itself.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AgentRole,
  MemoryDomain,
  MemoryReflectionOutput,
  MemoryRecommendation,
} from '../../types';

interface ReflectionOptions {
  period: 'daily' | 'weekly';
  cycleId?: string;
}

/**
 * Run memory reflection analysis for a company.
 */
export async function runMemoryReflection(
  supabase: SupabaseClient,
  companyId: string,
  options: ReflectionOptions
): Promise<MemoryReflectionOutput> {
  const { period } = options;
  const days = period === 'daily' ? 1 : 7;

  // Get usage stats
  const { data: usageStats } = await supabase.rpc('get_memory_usage_stats', {
    p_company_id: companyId,
    p_days: days,
  });

  const stats = usageStats || {
    total_recalls: 0,
    helpful_recalls: 0,
    unhelpful_recalls: 0,
    recall_accuracy: null,
    avg_relevance: null,
  };

  // Get domain-level stats
  const byDomain = await getDomainStats(supabase, companyId, days);

  // Get agent-level stats
  const byAgent = await getAgentStats(supabase, companyId, days);

  // Generate insights
  const insights = generateInsights(stats, byDomain, byAgent);

  // Generate recommendations
  const recommendations = await generateRecommendations(supabase, companyId, stats, byDomain);

  // Calculate overall health score
  const overallHealthScore = calculateHealthScore(stats, byDomain);

  // Generate weight change suggestions if enough data
  const suggestedWeightChanges =
    stats.total_recalls >= 20 ? suggestWeightChanges(stats, byDomain, byAgent) : null;

  const reflection: MemoryReflectionOutput = {
    id: crypto.randomUUID(),
    companyId,
    period,
    metrics: {
      totalRecalls: stats.total_recalls || 0,
      helpfulRecalls: stats.helpful_recalls || 0,
      unhelpfulRecalls: stats.unhelpful_recalls || 0,
      recallAccuracy: stats.recall_accuracy || 0,
      avgRelevanceScore: stats.avg_relevance || 0,
      byDomain,
      byAgent,
    },
    insights,
    recommendations,
    suggestedWeightChanges,
    overallHealthScore,
    createdAt: new Date().toISOString(),
  };

  return reflection;
}

/**
 * Get memory usage stats by domain.
 */
async function getDomainStats(
  supabase: SupabaseClient,
  companyId: string,
  days: number
): Promise<
  Record<
    MemoryDomain,
    {
      recalls: number;
      accuracy: number;
      topPerformingMemories: string[];
      underperformingMemories: string[];
    }
  >
> {
  const domains: MemoryDomain[] = ['business_context', 'competitors', 'market', 'agents'];
  const result = {} as Record<MemoryDomain, { recalls: number; accuracy: number; topPerformingMemories: string[]; underperformingMemories: string[] }>;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  for (const domain of domains) {
    // Get recall counts for this domain
    const { data: usageLogs } = await supabase
      .from('memory_usage_logs')
      .select('memory_id, was_helpful, relevance_score')
      .eq('company_id', companyId)
      .gt('created_at', cutoffDate.toISOString())
      .not('memory_id', 'is', null);

    // Get memory IDs for this domain
    const { data: domainMemories } = await supabase
      .from('company_memories')
      .select('id')
      .eq('company_id', companyId)
      .eq('domain', domain);

    const domainMemoryIds = new Set((domainMemories || []).map((m) => m.id));

    // Filter usage to this domain
    const domainUsage = (usageLogs || []).filter((u) => domainMemoryIds.has(u.memory_id));

    const recalls = domainUsage.length;
    const helpful = domainUsage.filter((u) => u.was_helpful === true).length;
    const rated = domainUsage.filter((u) => u.was_helpful !== null).length;
    const accuracy = rated > 0 ? helpful / rated : 0;

    // Find top and bottom performing memories
    const memoryPerformance = new Map<string, { helpful: number; total: number }>();

    for (const usage of domainUsage) {
      const existing = memoryPerformance.get(usage.memory_id) || { helpful: 0, total: 0 };
      existing.total++;
      if (usage.was_helpful) existing.helpful++;
      memoryPerformance.set(usage.memory_id, existing);
    }

    const sorted = Array.from(memoryPerformance.entries())
      .map(([id, { helpful, total }]) => ({ id, score: total > 0 ? helpful / total : 0, total }))
      .filter((m) => m.total >= 2) // Need at least 2 uses to judge
      .sort((a, b) => b.score - a.score);

    result[domain] = {
      recalls,
      accuracy,
      topPerformingMemories: sorted.slice(0, 3).map((m) => m.id),
      underperformingMemories: sorted
        .filter((m) => m.score < 0.5)
        .slice(-3)
        .map((m) => m.id),
    };
  }

  return result;
}

/**
 * Get memory usage stats by agent.
 */
async function getAgentStats(
  supabase: SupabaseClient,
  companyId: string,
  days: number
): Promise<
  Record<
    AgentRole,
    {
      recalls: number;
      mostUsedDomains: MemoryDomain[];
      avgRelevance: number;
    }
  >
> {
  const result: Partial<Record<AgentRole, { recalls: number; mostUsedDomains: MemoryDomain[]; avgRelevance: number }>> = {};

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  // Get all usage logs with domain info
  const { data: usageLogs } = await supabase
    .from('memory_usage_logs')
    .select('used_by_agent, memory_id, relevance_score')
    .eq('company_id', companyId)
    .gt('created_at', cutoffDate.toISOString());

  if (!usageLogs || usageLogs.length === 0) {
    return result as Record<AgentRole, { recalls: number; mostUsedDomains: MemoryDomain[]; avgRelevance: number }>;
  }

  // Get memory domains
  const memoryIds = [...new Set(usageLogs.map((u) => u.memory_id))];
  const { data: memories } = await supabase
    .from('company_memories')
    .select('id, domain')
    .in('id', memoryIds);

  const memoryDomainMap = new Map((memories || []).map((m) => [m.id, m.domain as MemoryDomain]));

  // Group by agent
  const agentUsage = new Map<
    string,
    { count: number; relevanceSum: number; relevanceCount: number; domainCounts: Map<MemoryDomain, number> }
  >();

  for (const log of usageLogs) {
    const agent = log.used_by_agent;
    const existing = agentUsage.get(agent) || {
      count: 0,
      relevanceSum: 0,
      relevanceCount: 0,
      domainCounts: new Map(),
    };

    existing.count++;

    if (log.relevance_score !== null) {
      existing.relevanceSum += log.relevance_score;
      existing.relevanceCount++;
    }

    const domain = memoryDomainMap.get(log.memory_id);
    if (domain) {
      existing.domainCounts.set(domain, (existing.domainCounts.get(domain) || 0) + 1);
    }

    agentUsage.set(agent, existing);
  }

  // Convert to result format
  for (const [agent, stats] of agentUsage.entries()) {
    const sortedDomains = Array.from(stats.domainCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([domain]) => domain);

    result[agent as AgentRole] = {
      recalls: stats.count,
      mostUsedDomains: sortedDomains,
      avgRelevance: stats.relevanceCount > 0 ? stats.relevanceSum / stats.relevanceCount : 0,
    };
  }

  return result as Record<AgentRole, { recalls: number; mostUsedDomains: MemoryDomain[]; avgRelevance: number }>;
}

/**
 * Generate human-readable insights from the stats.
 */
function generateInsights(
  stats: Record<string, unknown>,
  byDomain: MemoryReflectionOutput['metrics']['byDomain'],
  byAgent: MemoryReflectionOutput['metrics']['byAgent']
): string[] {
  const insights: string[] = [];

  // Overall accuracy insight
  const accuracy = (stats.recall_accuracy as number) || 0;
  if (accuracy >= 0.8) {
    insights.push('Memory recall accuracy is excellent (>80%). The system is retrieving relevant information.');
  } else if (accuracy >= 0.6) {
    insights.push('Memory recall accuracy is good (60-80%). Some optimization may improve results.');
  } else if (accuracy > 0 && accuracy < 0.6) {
    insights.push('Memory recall accuracy needs improvement (<60%). Consider adjusting recall weights.');
  }

  // Domain performance insights
  const domainPerformance = Object.entries(byDomain)
    .filter(([, d]) => d.recalls > 5)
    .map(([domain, d]) => ({ domain, accuracy: d.accuracy, recalls: d.recalls }))
    .sort((a, b) => b.accuracy - a.accuracy);

  if (domainPerformance.length >= 2) {
    const best = domainPerformance[0];
    const worst = domainPerformance[domainPerformance.length - 1];

    if (best.accuracy - worst.accuracy > 0.2) {
      insights.push(
        `${formatDomain(best.domain)} memories are performing ${Math.round((best.accuracy - worst.accuracy) * 100)}% better than ${formatDomain(worst.domain)}.`
      );
    }
  }

  // Agent usage insights
  const agentStats = Object.entries(byAgent).filter(([, a]) => a.recalls > 3);
  if (agentStats.length > 0) {
    const heaviestUser = agentStats.sort((a, b) => b[1].recalls - a[1].recalls)[0];
    insights.push(
      `${heaviestUser[0]} agent is the heaviest memory user with ${heaviestUser[1].recalls} recalls.`
    );
  }

  return insights;
}

/**
 * Generate actionable recommendations.
 */
async function generateRecommendations(
  supabase: SupabaseClient,
  companyId: string,
  stats: Record<string, unknown>,
  byDomain: MemoryReflectionOutput['metrics']['byDomain']
): Promise<MemoryRecommendation[]> {
  const recommendations: MemoryRecommendation[] = [];

  // Check for underperforming memories to archive
  for (const [domain, domainStats] of Object.entries(byDomain)) {
    if (domainStats.underperformingMemories.length > 0) {
      recommendations.push({
        id: crypto.randomUUID(),
        type: 'archive',
        memoryIds: domainStats.underperformingMemories,
        description: `Archive ${domainStats.underperformingMemories.length} underperforming ${formatDomain(domain)} memories`,
        impact: 'medium',
        autoApply: false,
      });
    }
  }

  // Check for memories that could be consolidated
  const { data: consolidationCandidates } = await supabase
    .from('company_memories')
    .select('domain')
    .eq('company_id', companyId)
    .eq('is_archived', false);

  const domainCounts = new Map<string, number>();
  for (const m of consolidationCandidates || []) {
    domainCounts.set(m.domain, (domainCounts.get(m.domain) || 0) + 1);
  }

  for (const [domain, count] of domainCounts) {
    if (count > 30) {
      recommendations.push({
        id: crypto.randomUUID(),
        type: 'consolidate',
        description: `Consolidate ${formatDomain(domain)} memories (${count} active)`,
        impact: 'high',
        autoApply: false,
      });
    }
  }

  // Suggest weight changes if accuracy is low
  const accuracy = (stats.recall_accuracy as number) || 0;
  if (accuracy > 0 && accuracy < 0.6) {
    recommendations.push({
      id: crypto.randomUUID(),
      type: 'weight_change',
      description: 'Increase semantic search weight to improve relevance',
      impact: 'high',
      autoApply: false,
    });
  }

  return recommendations;
}

/**
 * Calculate overall memory health score (0-100).
 */
function calculateHealthScore(
  stats: Record<string, unknown>,
  byDomain: MemoryReflectionOutput['metrics']['byDomain']
): number {
  let score = 50; // Base score

  // Accuracy contribution (up to 30 points)
  const accuracy = (stats.recall_accuracy as number) || 0;
  score += accuracy * 30;

  // Domain diversity (up to 10 points)
  const activeDomains = Object.values(byDomain).filter((d) => d.recalls > 0).length;
  score += (activeDomains / 4) * 10;

  // Usage volume (up to 10 points)
  const totalRecalls = (stats.total_recalls as number) || 0;
  score += Math.min(10, totalRecalls / 5);

  return Math.min(100, Math.round(score));
}

/**
 * Suggest recall weight changes based on performance data.
 */
function suggestWeightChanges(
  stats: Record<string, unknown>,
  byDomain: MemoryReflectionOutput['metrics']['byDomain'],
  byAgent: MemoryReflectionOutput['metrics']['byAgent']
): MemoryReflectionOutput['suggestedWeightChanges'] {
  // Default weights
  const currentWeights = {
    weightSemantic: 0.35,
    weightImportance: 0.25,
    weightConfidence: 0.15,
    weightRecency: 0.15,
    weightFrequency: 0.1,
  };

  // Analyze what needs adjustment
  const accuracy = (stats.recall_accuracy as number) || 0;

  if (accuracy < 0.5) {
    // Low accuracy - boost semantic search
    return {
      currentWeights,
      suggestedWeights: {
        weightSemantic: 0.4,
        weightImportance: 0.25,
        weightConfidence: 0.15,
        weightRecency: 0.1,
        weightFrequency: 0.1,
      },
      rationale: 'Low recall accuracy suggests memories are not contextually relevant. Increasing semantic weight.',
    };
  }

  // Check if certain domains are underperforming
  const domainAccuracies = Object.values(byDomain).map((d) => d.accuracy);
  const avgAccuracy = domainAccuracies.reduce((a, b) => a + b, 0) / domainAccuracies.length;

  if (avgAccuracy < 0.6) {
    return {
      currentWeights,
      suggestedWeights: {
        weightSemantic: 0.35,
        weightImportance: 0.3,
        weightConfidence: 0.15,
        weightRecency: 0.1,
        weightFrequency: 0.1,
      },
      rationale: 'Domain accuracy is mixed. Increasing importance weight to prioritize high-value memories.',
    };
  }

  return null;
}

function formatDomain(domain: string): string {
  return domain.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

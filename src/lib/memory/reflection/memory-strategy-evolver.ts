/**
 * Memory Strategy Evolver
 *
 * Automatically evolves memory recall strategy based on validated lessons.
 * Implements auto-rollback when strategy changes hurt performance.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  MemoryRecallConfig,
  MemoryLesson,
  MemoryDomain,
  AgentRole,
} from '../../types';

// Default recall weights
const DEFAULT_WEIGHTS = {
  weight_semantic: 0.35,
  weight_importance: 0.25,
  weight_confidence: 0.15,
  weight_recency: 0.15,
  weight_frequency: 0.1,
};

// Max change per evolution cycle (prevents wild swings)
const MAX_WEIGHT_DELTA = 0.05;

/**
 * Get or create recall config for a company.
 */
export async function getRecallConfig(
  supabase: SupabaseClient,
  companyId: string
): Promise<MemoryRecallConfig> {
  const { data: existing } = await supabase
    .from('memory_recall_configs')
    .select('*')
    .eq('company_id', companyId)
    .single();

  if (existing) {
    return mapConfig(existing);
  }

  // Create default config
  const { data: created, error } = await supabase
    .from('memory_recall_configs')
    .insert({
      company_id: companyId,
      ...DEFAULT_WEIGHTS,
      domain_boosts: {
        business_context: 1.0,
        competitors: 1.0,
        market: 1.0,
        agents: 1.0,
      },
      agent_domain_affinities: {},
      domain_half_life_overrides: {},
    })
    .select()
    .single();

  if (error) {
    console.error('[StrategyEvolver] Failed to create config:', error);
    // Return default
    return {
      id: '',
      companyId,
      weightSemantic: DEFAULT_WEIGHTS.weight_semantic,
      weightImportance: DEFAULT_WEIGHTS.weight_importance,
      weightConfidence: DEFAULT_WEIGHTS.weight_confidence,
      weightRecency: DEFAULT_WEIGHTS.weight_recency,
      weightFrequency: DEFAULT_WEIGHTS.weight_frequency,
      domainBoosts: { business_context: 1.0, competitors: 1.0, market: 1.0, agents: 1.0 },
      agentDomainAffinities: {} as Record<AgentRole, Record<MemoryDomain, number>>,
      domainHalfLifeOverrides: {},
      version: 1,
      updatedAt: new Date().toISOString(),
    };
  }

  return mapConfig(created!);
}

/**
 * Apply a memory lesson to the recall config.
 */
export async function applyLesson(
  supabase: SupabaseClient,
  companyId: string,
  lesson: MemoryLesson
): Promise<boolean> {
  const config = await getRecallConfig(supabase, companyId);

  switch (lesson.strategyType) {
    case 'weight_adjustment':
      return applyWeightAdjustment(supabase, config, lesson);

    case 'domain_priority':
      return applyDomainPriority(supabase, config, lesson);

    case 'attention_bias':
      return applyAttentionBias(supabase, config, lesson);

    case 'decay_adjustment':
      return applyDecayAdjustment(supabase, config, lesson);

    default:
      return false;
  }
}

/**
 * Apply weight adjustment from a lesson.
 */
async function applyWeightAdjustment(
  supabase: SupabaseClient,
  config: MemoryRecallConfig,
  lesson: MemoryLesson
): Promise<boolean> {
  const suggestedWeights = lesson.strategyAfter as Partial<{
    weightSemantic: number;
    weightImportance: number;
    weightConfidence: number;
    weightRecency: number;
    weightFrequency: number;
  }>;

  // Apply changes with max delta constraint
  const newWeights = {
    weight_semantic: clampDelta(
      config.weightSemantic,
      suggestedWeights.weightSemantic ?? config.weightSemantic
    ),
    weight_importance: clampDelta(
      config.weightImportance,
      suggestedWeights.weightImportance ?? config.weightImportance
    ),
    weight_confidence: clampDelta(
      config.weightConfidence,
      suggestedWeights.weightConfidence ?? config.weightConfidence
    ),
    weight_recency: clampDelta(
      config.weightRecency,
      suggestedWeights.weightRecency ?? config.weightRecency
    ),
    weight_frequency: clampDelta(
      config.weightFrequency,
      suggestedWeights.weightFrequency ?? config.weightFrequency
    ),
  };

  // Normalize weights to sum to 1.0
  const normalized = normalizeWeights(newWeights);

  const { error } = await supabase
    .from('memory_recall_configs')
    .update({
      ...normalized,
      version: config.version + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('company_id', config.companyId);

  return !error;
}

/**
 * Apply domain priority adjustment.
 */
async function applyDomainPriority(
  supabase: SupabaseClient,
  config: MemoryRecallConfig,
  lesson: MemoryLesson
): Promise<boolean> {
  const { domain, boost } = lesson.strategyAfter as { domain: MemoryDomain; boost: number };

  if (!domain || !boost) return false;

  const newBoosts = {
    ...config.domainBoosts,
    [domain]: Math.max(0.5, Math.min(2.0, boost)), // Clamp between 0.5x and 2x
  };

  const { error } = await supabase
    .from('memory_recall_configs')
    .update({
      domain_boosts: newBoosts,
      version: config.version + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('company_id', config.companyId);

  return !error;
}

/**
 * Apply agent attention bias.
 */
async function applyAttentionBias(
  supabase: SupabaseClient,
  config: MemoryRecallConfig,
  lesson: MemoryLesson
): Promise<boolean> {
  const { agent, domains } = lesson.strategyAfter as {
    agent: AgentRole;
    domains: MemoryDomain[];
  };

  if (!agent || !domains || domains.length === 0) return false;

  // Create affinity map for this agent
  const affinities: Record<MemoryDomain, number> = {
    business_context: 1.0,
    competitors: 1.0,
    market: 1.0,
    agents: 1.0,
  };

  // Boost preferred domains
  for (const domain of domains) {
    affinities[domain] = 1.3;
  }

  const newAffinities = {
    ...config.agentDomainAffinities,
    [agent]: affinities,
  };

  const { error } = await supabase
    .from('memory_recall_configs')
    .update({
      agent_domain_affinities: newAffinities,
      version: config.version + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('company_id', config.companyId);

  return !error;
}

/**
 * Apply decay adjustment (half-life override).
 */
async function applyDecayAdjustment(
  supabase: SupabaseClient,
  config: MemoryRecallConfig,
  lesson: MemoryLesson
): Promise<boolean> {
  const { domain, halfLifeDays } = lesson.strategyAfter as {
    domain: MemoryDomain;
    halfLifeDays: number;
  };

  if (!domain || !halfLifeDays) return false;

  const newOverrides = {
    ...config.domainHalfLifeOverrides,
    [domain]: Math.max(7, Math.min(90, halfLifeDays)), // Clamp between 7 and 90 days
  };

  const { error } = await supabase
    .from('memory_recall_configs')
    .update({
      domain_half_life_overrides: newOverrides,
      version: config.version + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('company_id', config.companyId);

  return !error;
}

/**
 * Check if strategy should be rolled back due to performance degradation.
 */
export async function checkStrategyRollback(
  supabase: SupabaseClient,
  companyId: string,
  currentAccuracy: number
): Promise<boolean> {
  // Get the most recent active lesson
  const { data: latestLesson } = await supabase
    .from('memory_lessons')
    .select('*')
    .eq('company_id', companyId)
    .in('status', ['active', 'validating'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (!latestLesson || !latestLesson.performance_before) {
    return false;
  }

  // Check for significant performance drop (>15%)
  const performanceBefore = latestLesson.performance_before as number;
  const dropPercent = (performanceBefore - currentAccuracy) / Math.max(0.01, performanceBefore);

  if (dropPercent > 0.15) {
    // Rollback: restore previous strategy
    console.log('[StrategyEvolver] Rolling back strategy due to performance drop');

    // Get current config
    const config = await getRecallConfig(supabase, companyId);

    // Restore from lesson's "before" state
    const previousWeights = latestLesson.strategy_before as Partial<MemoryRecallConfig>;

    if (previousWeights) {
      await supabase
        .from('memory_recall_configs')
        .update({
          weight_semantic: previousWeights.weightSemantic ?? config.weightSemantic,
          weight_importance: previousWeights.weightImportance ?? config.weightImportance,
          weight_confidence: previousWeights.weightConfidence ?? config.weightConfidence,
          weight_recency: previousWeights.weightRecency ?? config.weightRecency,
          weight_frequency: previousWeights.weightFrequency ?? config.weightFrequency,
          version: config.version + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('company_id', companyId);
    }

    // Deprecate the lesson
    await supabase
      .from('memory_lessons')
      .update({
        status: 'deprecated',
        performance_after: currentAccuracy,
        updated_at: new Date().toISOString(),
      })
      .eq('id', latestLesson.id);

    return true;
  }

  // Update performance_after for tracking
  await supabase
    .from('memory_lessons')
    .update({
      performance_after: currentAccuracy,
      updated_at: new Date().toISOString(),
    })
    .eq('id', latestLesson.id);

  return false;
}

/**
 * Apply active lessons to the recall config.
 */
export async function applyActiveLessons(
  supabase: SupabaseClient,
  companyId: string
): Promise<number> {
  const { data: activeLessons } = await supabase
    .from('memory_lessons')
    .select('*')
    .eq('company_id', companyId)
    .eq('status', 'active');

  if (!activeLessons || activeLessons.length === 0) {
    return 0;
  }

  let applied = 0;

  for (const row of activeLessons) {
    const lesson = mapLesson(row);
    const success = await applyLesson(supabase, companyId, lesson);
    if (success) applied++;
  }

  return applied;
}

/**
 * Clamp the change between current and target values.
 */
function clampDelta(current: number, target: number): number {
  const delta = target - current;
  const clampedDelta = Math.max(-MAX_WEIGHT_DELTA, Math.min(MAX_WEIGHT_DELTA, delta));
  return current + clampedDelta;
}

/**
 * Normalize weights to sum to 1.0.
 */
function normalizeWeights(weights: {
  weight_semantic: number;
  weight_importance: number;
  weight_confidence: number;
  weight_recency: number;
  weight_frequency: number;
}): typeof weights {
  const sum =
    weights.weight_semantic +
    weights.weight_importance +
    weights.weight_confidence +
    weights.weight_recency +
    weights.weight_frequency;

  if (sum === 0) return weights;

  return {
    weight_semantic: weights.weight_semantic / sum,
    weight_importance: weights.weight_importance / sum,
    weight_confidence: weights.weight_confidence / sum,
    weight_recency: weights.weight_recency / sum,
    weight_frequency: weights.weight_frequency / sum,
  };
}

function mapConfig(row: Record<string, unknown>): MemoryRecallConfig {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    weightSemantic: row.weight_semantic as number,
    weightImportance: row.weight_importance as number,
    weightConfidence: row.weight_confidence as number,
    weightRecency: row.weight_recency as number,
    weightFrequency: row.weight_frequency as number,
    domainBoosts: row.domain_boosts as Record<MemoryDomain, number>,
    agentDomainAffinities: row.agent_domain_affinities as Record<AgentRole, Record<MemoryDomain, number>>,
    domainHalfLifeOverrides: row.domain_half_life_overrides as Partial<Record<MemoryDomain, number>>,
    version: row.version as number,
    updatedAt: row.updated_at as string,
  };
}

function mapLesson(row: Record<string, unknown>): MemoryLesson {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    lesson: row.lesson as string,
    evidence: row.evidence as { period: string; metric: string; value: number }[],
    strategyType: row.strategy_type as MemoryLesson['strategyType'],
    strategyBefore: row.strategy_before as Record<string, unknown>,
    strategyAfter: row.strategy_after as Record<string, unknown>,
    status: row.status as MemoryLesson['status'],
    validationCycles: row.validation_cycles as number,
    requiredCycles: row.required_cycles as number,
    performanceBefore: row.performance_before as number | null,
    performanceAfter: row.performance_after as number | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

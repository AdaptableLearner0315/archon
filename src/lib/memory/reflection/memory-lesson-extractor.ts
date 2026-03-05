/**
 * Memory Lesson Extractor
 *
 * Extracts learnings from memory performance data and creates
 * memory_lessons entries for strategy evolution.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  MemoryLesson,
  MemoryLessonStatus,
  MemoryStrategyType,
  MemoryReflectionOutput,
} from '../../types';

interface LessonExtractionResult {
  extracted: number;
  lessons: MemoryLesson[];
}

/**
 * Extract lessons from a memory reflection output.
 */
export async function extractMemoryLessons(
  supabase: SupabaseClient,
  reflection: MemoryReflectionOutput
): Promise<LessonExtractionResult> {
  const { companyId, metrics, recommendations, suggestedWeightChanges } = reflection;
  const lessons: MemoryLesson[] = [];

  // Extract lessons from recommendations
  for (const rec of recommendations) {
    if (rec.type === 'weight_change' && suggestedWeightChanges) {
      const lesson = await createLesson(supabase, {
        companyId,
        lesson: rec.description,
        evidence: [
          {
            period: reflection.period,
            metric: 'recall_accuracy',
            value: metrics.recallAccuracy,
          },
        ],
        strategyType: 'weight_adjustment',
        strategyBefore: suggestedWeightChanges.currentWeights,
        strategyAfter: suggestedWeightChanges.suggestedWeights,
        performanceBefore: metrics.recallAccuracy,
      });

      if (lesson) lessons.push(lesson);
    }
  }

  // Extract domain-specific lessons
  const domainLessons = extractDomainLessons(metrics);
  for (const domainLesson of domainLessons) {
    const lesson = await createLesson(supabase, {
      companyId,
      lesson: domainLesson.lesson,
      evidence: [
        {
          period: reflection.period,
          metric: 'domain_accuracy',
          value: domainLesson.accuracy,
        },
      ],
      strategyType: 'domain_priority',
      strategyBefore: {},
      strategyAfter: { domain: domainLesson.domain, boost: domainLesson.suggestedBoost },
      performanceBefore: metrics.recallAccuracy,
    });

    if (lesson) lessons.push(lesson);
  }

  // Extract agent-specific lessons
  const agentLessons = extractAgentLessons(metrics);
  for (const agentLesson of agentLessons) {
    const lesson = await createLesson(supabase, {
      companyId,
      lesson: agentLesson.lesson,
      evidence: [
        {
          period: reflection.period,
          metric: 'agent_relevance',
          value: agentLesson.avgRelevance,
        },
      ],
      strategyType: 'attention_bias',
      strategyBefore: {},
      strategyAfter: {
        agent: agentLesson.agent,
        domains: agentLesson.preferredDomains,
      },
      performanceBefore: metrics.recallAccuracy,
    });

    if (lesson) lessons.push(lesson);
  }

  return {
    extracted: lessons.length,
    lessons,
  };
}

/**
 * Extract lessons about domain performance.
 */
function extractDomainLessons(
  metrics: MemoryReflectionOutput['metrics']
): { domain: string; lesson: string; accuracy: number; suggestedBoost: number }[] {
  const lessons: { domain: string; lesson: string; accuracy: number; suggestedBoost: number }[] = [];

  const domainPerformance = Object.entries(metrics.byDomain)
    .filter(([, d]) => d.recalls >= 5)
    .map(([domain, d]) => ({ domain, accuracy: d.accuracy, recalls: d.recalls }))
    .sort((a, b) => b.accuracy - a.accuracy);

  if (domainPerformance.length < 2) return [];

  // Top performing domain
  const best = domainPerformance[0];
  if (best.accuracy >= 0.7) {
    lessons.push({
      domain: best.domain,
      lesson: `${formatDomain(best.domain)} memories have high accuracy (${Math.round(best.accuracy * 100)}%). Consider boosting weight.`,
      accuracy: best.accuracy,
      suggestedBoost: 1.2,
    });
  }

  // Underperforming domain
  const worst = domainPerformance[domainPerformance.length - 1];
  if (worst.accuracy < 0.5 && worst.recalls >= 5) {
    lessons.push({
      domain: worst.domain,
      lesson: `${formatDomain(worst.domain)} memories have low accuracy (${Math.round(worst.accuracy * 100)}%). Consider reducing weight or curating.`,
      accuracy: worst.accuracy,
      suggestedBoost: 0.8,
    });
  }

  return lessons;
}

/**
 * Extract lessons about agent memory usage patterns.
 */
function extractAgentLessons(
  metrics: MemoryReflectionOutput['metrics']
): { agent: string; lesson: string; avgRelevance: number; preferredDomains: string[] }[] {
  const lessons: { agent: string; lesson: string; avgRelevance: number; preferredDomains: string[] }[] = [];

  for (const [agent, stats] of Object.entries(metrics.byAgent)) {
    if (stats.recalls < 5) continue;

    if (stats.avgRelevance >= 0.7 && stats.mostUsedDomains.length > 0) {
      lessons.push({
        agent,
        lesson: `${agent} agent performs well with ${stats.mostUsedDomains.join(', ')} domains (${Math.round(stats.avgRelevance * 100)}% relevance).`,
        avgRelevance: stats.avgRelevance,
        preferredDomains: stats.mostUsedDomains,
      });
    }
  }

  return lessons;
}

/**
 * Create a new memory lesson in the database.
 */
async function createLesson(
  supabase: SupabaseClient,
  input: {
    companyId: string;
    lesson: string;
    evidence: { period: string; metric: string; value: number }[];
    strategyType: MemoryStrategyType;
    strategyBefore: Record<string, unknown>;
    strategyAfter: Record<string, unknown>;
    performanceBefore: number | null;
  }
): Promise<MemoryLesson | null> {
  // Check if a similar lesson already exists
  const { data: existing } = await supabase
    .from('memory_lessons')
    .select('id')
    .eq('company_id', input.companyId)
    .eq('strategy_type', input.strategyType)
    .in('status', ['proposed', 'validating'])
    .limit(1);

  if (existing && existing.length > 0) {
    // Don't create duplicate lessons
    return null;
  }

  const { data, error } = await supabase
    .from('memory_lessons')
    .insert({
      company_id: input.companyId,
      lesson: input.lesson,
      evidence: input.evidence,
      strategy_type: input.strategyType,
      strategy_before: input.strategyBefore,
      strategy_after: input.strategyAfter,
      status: 'proposed',
      validation_cycles: 0,
      required_cycles: 5,
      performance_before: input.performanceBefore,
    })
    .select()
    .single();

  if (error) {
    console.error('[LessonExtractor] Failed to create lesson:', error);
    return null;
  }

  return mapLesson(data);
}

/**
 * Get active lessons for a company.
 */
export async function getActiveLessons(
  supabase: SupabaseClient,
  companyId: string
): Promise<MemoryLesson[]> {
  const { data } = await supabase
    .from('memory_lessons')
    .select('*')
    .eq('company_id', companyId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false });

  return (data || []).map(mapLesson);
}

/**
 * Get pending lessons (proposed or validating) for a company.
 */
export async function getPendingLessons(
  supabase: SupabaseClient,
  companyId: string
): Promise<MemoryLesson[]> {
  const { data } = await supabase
    .from('memory_lessons')
    .select('*')
    .eq('company_id', companyId)
    .in('status', ['proposed', 'validating'])
    .order('created_at', { ascending: false });

  return (data || []).map(mapLesson);
}

/**
 * Update lesson status after validation cycle.
 */
export async function updateLessonValidation(
  supabase: SupabaseClient,
  lessonId: string,
  currentPerformance: number
): Promise<boolean> {
  const { data: lesson } = await supabase
    .from('memory_lessons')
    .select('*')
    .eq('id', lessonId)
    .single();

  if (!lesson) return false;

  const newValidationCycles = (lesson.validation_cycles || 0) + 1;
  let newStatus: MemoryLessonStatus = lesson.status;

  // Check if lesson should be promoted or deprecated
  if (newValidationCycles >= lesson.required_cycles) {
    const performanceBefore = lesson.performance_before || 0;
    const improvement = currentPerformance - performanceBefore;

    if (improvement >= 0.05) {
      // 5% improvement - activate
      newStatus = 'active';
    } else if (improvement < -0.1) {
      // 10% degradation - deprecate
      newStatus = 'deprecated';
    } else {
      // Inconclusive - keep validating but with more cycles
      newStatus = 'validating';
    }
  } else if (lesson.status === 'proposed') {
    // Move from proposed to validating
    newStatus = 'validating';
  }

  const { error } = await supabase
    .from('memory_lessons')
    .update({
      validation_cycles: newValidationCycles,
      status: newStatus,
      performance_after: currentPerformance,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lessonId);

  return !error;
}

/**
 * Deprecate a lesson (rollback).
 */
export async function deprecateLesson(
  supabase: SupabaseClient,
  lessonId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('memory_lessons')
    .update({
      status: 'deprecated',
      updated_at: new Date().toISOString(),
    })
    .eq('id', lessonId);

  return !error;
}

function mapLesson(row: Record<string, unknown>): MemoryLesson {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    lesson: row.lesson as string,
    evidence: row.evidence as { period: string; metric: string; value: number }[],
    strategyType: row.strategy_type as MemoryStrategyType,
    strategyBefore: row.strategy_before as Record<string, unknown>,
    strategyAfter: row.strategy_after as Record<string, unknown>,
    status: row.status as MemoryLessonStatus,
    validationCycles: row.validation_cycles as number,
    requiredCycles: row.required_cycles as number,
    performanceBefore: row.performance_before as number | null,
    performanceAfter: row.performance_after as number | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function formatDomain(domain: string): string {
  return domain.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

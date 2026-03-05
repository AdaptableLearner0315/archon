import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ReflectionOutput,
  ReflectionPeriod,
  ReflectionRecommendation,
  ReflectionSummary,
} from '../../types';
import { ClaudeClient } from '../claude-client';
import { CostTracker } from '../cost-tracker';
import { getReflectionPrompt, REFLECTION_SYSTEM_PROMPT } from './reflection-prompt';
import {
  gatherPerformanceMetrics,
  buildReflectionContext,
  createFallbackRecommendations,
} from './recommendation-generator';
import { v4 as uuid } from 'uuid';

interface RunReflectionOptions {
  cycleId?: string;
  period?: ReflectionPeriod;
}

export async function runReflection(
  companyId: string,
  supabase: SupabaseClient,
  options: RunReflectionOptions = {}
): Promise<ReflectionOutput> {
  const period: ReflectionPeriod = options.period || 'weekly';
  const daysBack = period === 'daily' ? 1 : 7;
  const reflectionId = uuid();

  // Gather performance data
  const metrics = await gatherPerformanceMetrics(companyId, daysBack, supabase);
  const context = buildReflectionContext(metrics);

  // Call Claude for reflection analysis
  const prompt = getReflectionPrompt(period);
  const result = await ClaudeClient.call({
    useCase: 'reflection',
    system: `${REFLECTION_SYSTEM_PROMPT}\n\n${prompt}`,
    messages: [
      {
        role: 'user',
        content: `Analyze the following performance data and generate a ${period} reflection:\n\n${context}`,
      },
    ],
  });

  // Track cost
  if (options.cycleId) {
    CostTracker.record(options.cycleId, 'ceo', result.usage, result.costUsd);
  }

  // Parse response
  let reflection: ReflectionOutput;
  try {
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    reflection = {
      id: reflectionId,
      companyId,
      period,
      summary: parsed.summary as ReflectionSummary,
      recommendations: parsed.recommendations as ReflectionRecommendation[],
      overallHealthScore: parsed.overallHealthScore || 70,
      createdAt: new Date().toISOString(),
    };

    // Ensure all recommendations have IDs
    reflection.recommendations = reflection.recommendations.map((rec) => ({
      ...rec,
      id: rec.id || uuid(),
      triggerEnabled: rec.triggerEnabled !== false,
    }));
  } catch {
    // Fallback to generated recommendations
    const fallbackRecs = createFallbackRecommendations(metrics);
    reflection = {
      id: reflectionId,
      companyId,
      period,
      summary: {
        kpiChanges: Object.entries(metrics.kpiData).map(([metric, data]) => ({
          metric,
          from: data.previous,
          to: data.current,
          change: `${data.current - data.previous >= 0 ? '+' : ''}${((data.current - data.previous) / (data.previous || 1) * 100).toFixed(1)}%`,
          isPositive: data.current >= data.previous,
        })),
        topWin: 'System operating normally',
        topConcern: fallbackRecs.length > 0 ? fallbackRecs[0].title : 'No major concerns',
      },
      recommendations: fallbackRecs,
      overallHealthScore: fallbackRecs.some((r) => r.criticality === 'critical') ? 50 : 70,
      createdAt: new Date().toISOString(),
    };
  }

  // Persist to database
  await supabase.from('agent_reflections').insert({
    id: reflection.id,
    company_id: companyId,
    period,
    summary: reflection.summary,
    recommendations: reflection.recommendations,
    health_score: reflection.overallHealthScore,
  });

  return reflection;
}

export async function getLatestReflection(
  companyId: string,
  supabase: SupabaseClient,
  period?: ReflectionPeriod
): Promise<ReflectionOutput | null> {
  const query = supabase
    .from('agent_reflections')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (period) {
    query.eq('period', period);
  }

  const { data } = await query;

  if (!data || data.length === 0) {
    return null;
  }

  const row = data[0];
  return {
    id: row.id,
    companyId: row.company_id,
    period: row.period,
    summary: row.summary as ReflectionSummary,
    recommendations: row.recommendations as ReflectionRecommendation[],
    overallHealthScore: row.health_score || 70,
    createdAt: row.created_at,
  };
}

export async function getReflectionHistory(
  companyId: string,
  supabase: SupabaseClient,
  limit: number = 10
): Promise<ReflectionOutput[]> {
  const { data } = await supabase
    .from('agent_reflections')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data || []).map((row) => ({
    id: row.id,
    companyId: row.company_id,
    period: row.period,
    summary: row.summary as ReflectionSummary,
    recommendations: row.recommendations as ReflectionRecommendation[],
    overallHealthScore: row.health_score || 70,
    createdAt: row.created_at,
  }));
}

export async function triggerRecommendation(
  reflectionId: string,
  recommendationId: string,
  triggeredVia: 'slack' | 'email' | 'voice' | 'webapp' | 'sms',
  supabase: SupabaseClient
): Promise<{ triggerId: string; recommendation: ReflectionRecommendation | null }> {
  // Get the reflection
  const { data: reflection } = await supabase
    .from('agent_reflections')
    .select('*')
    .eq('id', reflectionId)
    .single();

  if (!reflection) {
    throw new Error('Reflection not found');
  }

  const recommendations = reflection.recommendations as ReflectionRecommendation[];
  const recommendation = recommendations.find((r) => r.id === recommendationId);

  if (!recommendation) {
    throw new Error('Recommendation not found');
  }

  if (!recommendation.triggerEnabled) {
    throw new Error('This recommendation cannot be triggered');
  }

  // Create trigger record
  const triggerId = uuid();
  await supabase.from('reflection_triggers').insert({
    id: triggerId,
    reflection_id: reflectionId,
    recommendation_id: recommendationId,
    triggered_via: triggeredVia,
    status: 'pending',
  });

  return { triggerId, recommendation };
}

export async function updateTriggerStatus(
  triggerId: string,
  status: 'running' | 'completed' | 'failed',
  cycleId: string | null,
  supabase: SupabaseClient
): Promise<void> {
  await supabase
    .from('reflection_triggers')
    .update({ status, cycle_id: cycleId })
    .eq('id', triggerId);
}

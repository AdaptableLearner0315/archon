import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentRole, PromptVersion, CycleRetrospective, AgentLesson } from '../../types';
import { ClaudeClient } from '../claude-client';
import { AGENT_SYSTEM_PROMPTS } from '../prompts';
import { getAgentTrend } from './scorer';
import { getActiveLessonsForAgent, recordLessonImpact, deprecateLesson } from '../learning';

const MAX_CHANGE_PERCENT: Record<string, number> = {
  starter: 0.10,
  growth: 0.15,
  scale: 0.25,
};

export async function getActivePrompt(
  companyId: string,
  agentRole: AgentRole,
  supabase: SupabaseClient
): Promise<string> {
  const { data } = await supabase
    .from('prompt_versions')
    .select('prompt_text')
    .eq('company_id', companyId)
    .eq('agent_role', agentRole)
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  const basePrompt = data?.prompt_text ?? AGENT_SYSTEM_PROMPTS[agentRole];

  // Get active lessons and inject them
  const lessons = await getActiveLessonsForAgent(companyId, agentRole, supabase);

  if (lessons.length === 0) {
    return basePrompt;
  }

  // Build learned behaviors section
  const learnedBehaviors = lessons
    .map((lesson) => lesson.promptAddition)
    .join('\n');

  // Inject lessons after the core identity section
  return `${basePrompt}

## Learned Behaviors (from validated experience)
${learnedBehaviors}`;
}

export async function getActivePromptWithLessons(
  companyId: string,
  agentRole: AgentRole,
  supabase: SupabaseClient
): Promise<{ prompt: string; lessons: AgentLesson[] }> {
  const { data } = await supabase
    .from('prompt_versions')
    .select('prompt_text')
    .eq('company_id', companyId)
    .eq('agent_role', agentRole)
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  const basePrompt = data?.prompt_text ?? AGENT_SYSTEM_PROMPTS[agentRole];
  const lessons = await getActiveLessonsForAgent(companyId, agentRole, supabase);

  if (lessons.length === 0) {
    return { prompt: basePrompt, lessons: [] };
  }

  const learnedBehaviors = lessons
    .map((lesson) => lesson.promptAddition)
    .join('\n');

  const fullPrompt = `${basePrompt}

## Learned Behaviors (from validated experience)
${learnedBehaviors}`;

  return { prompt: fullPrompt, lessons };
}

export async function evolvePrompt(
  companyId: string,
  agentRole: AgentRole,
  companyPlan: string,
  retrospective: CycleRetrospective,
  supabase: SupabaseClient
): Promise<PromptVersion | null> {
  const { trend } = await getAgentTrend(companyId, agentRole, 5, supabase);
  const retroSuggestion = retrospective.suggestedPromptChanges.find((s) => s.role === agentRole);

  if (trend !== 'declining' && !retroSuggestion) return null;

  const currentPrompt = await getActivePrompt(companyId, agentRole, supabase);

  const { data: latestVersion } = await supabase
    .from('prompt_versions')
    .select('version')
    .eq('company_id', companyId)
    .eq('agent_role', agentRole)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  const nextVersion = (latestVersion?.version ?? 0) + 1;
  const maxChangePct = MAX_CHANGE_PERCENT[companyPlan] ?? 0.10;

  const result = await ClaudeClient.call({
    useCase: 'memory_condensation',
    system: `You are a prompt engineering specialist. Evolve the given agent prompt to improve performance.

Rules:
- Maximum ${Math.round(maxChangePct * 100)}% character difference from original
- Keep the core identity and role intact
- Focus on the specific feedback provided
- Output ONLY the new prompt text, nothing else

Current performance trend: ${trend}
${retroSuggestion ? `Specific suggestion: ${retroSuggestion.suggestion}` : ''}`,
    messages: [{
      role: 'user',
      content: `Current prompt:\n${currentPrompt}\n\nRetro feedback: ${JSON.stringify(retrospective.agentScores.find((s) => s.role === agentRole))}\n\nEvolve this prompt to address the issues while staying within the change limit.`,
    }],
  });

  const newPromptText = result.text.trim();

  // Validate change is within bounds
  const changeRatio = approximateChangeRatio(currentPrompt, newPromptText);
  if (changeRatio > maxChangePct) {
    console.warn(`Prompt evolution exceeded change cap (${changeRatio.toFixed(2)} > ${maxChangePct}). Skipping.`);
    return null;
  }

  const agentScore = retrospective.agentScores.find((s) => s.role === agentRole);
  const performanceBefore = agentScore?.score ?? null;

  // Deactivate old prompts
  await supabase
    .from('prompt_versions')
    .update({ is_active: false })
    .eq('company_id', companyId)
    .eq('agent_role', agentRole);

  const { data: newVersion, error } = await supabase
    .from('prompt_versions')
    .insert({
      company_id: companyId,
      agent_role: agentRole,
      version: nextVersion,
      prompt_text: newPromptText,
      is_active: true,
      performance_before: performanceBefore,
    })
    .select()
    .single();

  if (error || !newVersion) {
    console.error('Failed to save evolved prompt:', error);
    return null;
  }

  return {
    id: newVersion.id,
    companyId: newVersion.company_id,
    agentRole: newVersion.agent_role,
    version: newVersion.version,
    promptText: newVersion.prompt_text,
    isActive: true,
    performanceBefore,
    performanceAfter: null,
    createdAt: newVersion.created_at,
  };
}

export async function checkAutoRollback(
  companyId: string,
  agentRole: AgentRole,
  currentScore: number,
  supabase: SupabaseClient
): Promise<boolean> {
  let rolledBack = false;

  // Check prompt versions
  const { data: latestPrompt } = await supabase
    .from('prompt_versions')
    .select('*')
    .eq('company_id', companyId)
    .eq('agent_role', agentRole)
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (latestPrompt && latestPrompt.performance_before !== null) {
    const dropPercent = (latestPrompt.performance_before - currentScore) / latestPrompt.performance_before;

    if (dropPercent > 0.20) {
      await supabase
        .from('prompt_versions')
        .update({ is_active: false, performance_after: currentScore })
        .eq('id', latestPrompt.id);

      const { data: previous } = await supabase
        .from('prompt_versions')
        .select('id')
        .eq('company_id', companyId)
        .eq('agent_role', agentRole)
        .lt('version', latestPrompt.version)
        .order('version', { ascending: false })
        .limit(1)
        .single();

      if (previous) {
        await supabase
          .from('prompt_versions')
          .update({ is_active: true })
          .eq('id', previous.id);
      }

      rolledBack = true;
    } else {
      await supabase
        .from('prompt_versions')
        .update({ performance_after: currentScore })
        .eq('id', latestPrompt.id);
    }
  }

  // Check active lessons for performance impact
  const lessons = await getActiveLessonsForAgent(companyId, agentRole, supabase);

  for (const lesson of lessons) {
    // Record current performance for active lessons
    if (lesson.impactMetrics?.before && !lesson.impactMetrics?.after) {
      await recordLessonImpact(lesson.id, lesson.impactMetrics.before, currentScore, supabase);

      // Auto-deprecate if performance dropped >10% after lesson activation
      const dropPercent = (lesson.impactMetrics.before - currentScore) / lesson.impactMetrics.before;
      if (dropPercent > 0.10) {
        await deprecateLesson(lesson.id, `Performance dropped ${Math.round(dropPercent * 100)}% after activation`, supabase);
        rolledBack = true;
      }
    }
  }

  return rolledBack;
}

export async function activateLessonWithTracking(
  lessonId: string,
  currentPerformance: number,
  supabase: SupabaseClient
): Promise<boolean> {
  const { error } = await supabase
    .from('agent_lessons')
    .update({
      status: 'active',
      impact_before: currentPerformance,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lessonId);

  return !error;
}

function approximateChangeRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;

  let differences = 0;
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i++) {
    if (a[i] !== b[i]) differences++;
  }
  differences += Math.abs(a.length - b.length);

  return differences / maxLen;
}

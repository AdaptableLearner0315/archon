import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentRole, PromptVersion, CycleRetrospective } from '../../types';
import { ClaudeClient } from '../claude-client';
import { AGENT_SYSTEM_PROMPTS } from '../prompts';
import { getAgentTrend } from './scorer';

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

  return data?.prompt_text ?? AGENT_SYSTEM_PROMPTS[agentRole];
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
  const { data: latestPrompt } = await supabase
    .from('prompt_versions')
    .select('*')
    .eq('company_id', companyId)
    .eq('agent_role', agentRole)
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (!latestPrompt || latestPrompt.performance_before === null) return false;

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

    return true;
  }

  await supabase
    .from('prompt_versions')
    .update({ performance_after: currentScore })
    .eq('id', latestPrompt.id);

  return false;
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

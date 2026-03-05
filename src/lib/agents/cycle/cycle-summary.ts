import type { SupabaseClient } from '@supabase/supabase-js';
import type { CyclePlan, CycleTask, CycleSummary, AgentRole } from '../../types';
import { ClaudeClient } from '../claude-client';

const SUMMARY_GENERATION_PROMPT = `You are Atlas, the CEO agent, generating a cycle summary for the team.

Based on the cycle plan and task results, create a structured summary that captures:
1. A punchy headline summarizing the cycle
2. Key metrics impact (if measurable)
3. CEO's strategic commentary
4. Next priority

Output in this exact JSON format:
{
  "headline": "One compelling sentence summarizing what happened",
  "metricsImpact": [
    {"metric": "metric name", "before": 0, "after": 0, "delta": "+10%"}
  ],
  "ceoComment": "Strategic assessment of the cycle's outcomes and what it means for the company",
  "nextPriority": "What should be the focus for the next cycle"
}

Make the headline engaging but factual. The CEO comment should be insightful and forward-looking.
Output ONLY the JSON.`;

export async function generateCycleSummary(
  cycleId: string,
  companyId: string,
  plan: CyclePlan,
  tasks: CycleTask[],
  alignmentScore: number,
  supabase: SupabaseClient
): Promise<CycleSummary | null> {
  try {
    // Get cycle number
    const { count } = await supabase
      .from('operating_cycles')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'done');

    const cycleNumber = (count || 0) + 1;

    // Calculate duration
    const { data: cycleData } = await supabase
      .from('operating_cycles')
      .select('started_at, completed_at')
      .eq('id', cycleId)
      .single();

    const startTime = cycleData?.started_at ? new Date(cycleData.started_at).getTime() : Date.now();
    const endTime = cycleData?.completed_at ? new Date(cycleData.completed_at).getTime() : Date.now();
    const actualMinutes = Math.round((endTime - startTime) / 60000);

    // Build completed and in-progress lists
    const completed = tasks
      .filter((t) => t.status === 'completed')
      .map((t) => ({
        agent: t.agentRole,
        task: t.description,
        outcome: 'success' as const,
        highlight: t.result?.slice(0, 100),
      }));

    const inProgress = tasks
      .filter((t) => t.status === 'needs_data' || t.status === 'running')
      .map((t) => ({
        agent: t.agentRole,
        task: t.description,
        blockedBy: t.error || undefined,
      }));

    const blocked = tasks
      .filter((t) => t.status === 'blocked' || t.status === 'failed')
      .map((t) => ({
        agent: t.agentRole,
        task: t.description,
        outcome: 'blocked' as const,
      }));

    // Generate headline and CEO comment via Claude
    const taskSummary = tasks
      .map((t) => `- ${t.agentName}: ${t.description.slice(0, 100)} [${t.status}]`)
      .join('\n');

    const result = await ClaudeClient.call({
      useCase: 'memory_condensation',
      system: SUMMARY_GENERATION_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Cycle #${cycleNumber}
Directive: ${plan.directive}
Duration: ${actualMinutes} minutes

Task Results:
${taskSummary}

Completed: ${completed.length}/${tasks.length}
Blocked: ${blocked.length}
Alignment Score: ${alignmentScore}/100

Generate the cycle summary.`,
        },
      ],
    });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    let headline = `Cycle #${cycleNumber}: ${plan.directive}`;
    let metricsImpact: CycleSummary['metricsImpact'] = [];
    let ceoComment = `Completed ${completed.length} of ${tasks.length} tasks.`;
    let nextPriority = 'Continue momentum on current priorities.';

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      headline = parsed.headline || headline;
      metricsImpact = parsed.metricsImpact || [];
      ceoComment = parsed.ceoComment || ceoComment;
      nextPriority = parsed.nextPriority || nextPriority;
    }

    const summary: Omit<CycleSummary, 'id' | 'createdAt'> = {
      cycleId,
      companyId,
      cycleNumber,
      duration: {
        planned: 15, // Default planned duration
        actual: actualMinutes,
      },
      headline,
      completed: [...completed, ...blocked],
      inProgress,
      metricsImpact,
      alignmentScore,
      ceoComment,
      nextPriority,
    };

    // Store in database
    const { data, error } = await supabase
      .from('cycle_summaries')
      .upsert(
        {
          cycle_id: summary.cycleId,
          company_id: summary.companyId,
          cycle_number: summary.cycleNumber,
          duration_planned: summary.duration.planned,
          duration_actual: summary.duration.actual,
          headline: summary.headline,
          completed: summary.completed,
          in_progress: summary.inProgress,
          metrics_impact: summary.metricsImpact,
          alignment_score: summary.alignmentScore,
          ceo_comment: summary.ceoComment,
          next_priority: summary.nextPriority,
        },
        { onConflict: 'cycle_id' }
      )
      .select('id, created_at')
      .single();

    if (error) {
      console.error('Failed to store cycle summary:', error);
      return null;
    }

    // Update company's total cycles completed
    try {
      await supabase.rpc('increment_company_cycles', { company_id_param: companyId });
    } catch {
      // Fallback if RPC doesn't exist
      await supabase
        .from('companies')
        .update({ total_cycles_completed: cycleNumber })
        .eq('id', companyId);
    }

    return {
      ...summary,
      id: data.id,
      createdAt: data.created_at,
    };
  } catch (error) {
    console.error('Cycle summary generation failed:', error);
    return null;
  }
}

export async function getCycleSummary(
  cycleId: string,
  supabase: SupabaseClient
): Promise<CycleSummary | null> {
  const { data, error } = await supabase
    .from('cycle_summaries')
    .select('*')
    .eq('cycle_id', cycleId)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    cycleId: data.cycle_id,
    companyId: data.company_id,
    cycleNumber: data.cycle_number,
    duration: {
      planned: data.duration_planned,
      actual: data.duration_actual,
    },
    headline: data.headline,
    completed: data.completed || [],
    inProgress: data.in_progress || [],
    metricsImpact: data.metrics_impact || [],
    alignmentScore: data.alignment_score,
    ceoComment: data.ceo_comment,
    nextPriority: data.next_priority,
    createdAt: data.created_at,
  };
}

export async function getRecentCycleSummaries(
  companyId: string,
  limit: number = 10,
  supabase: SupabaseClient
): Promise<CycleSummary[]> {
  const { data, error } = await supabase
    .from('cycle_summaries')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    cycleId: row.cycle_id,
    companyId: row.company_id,
    cycleNumber: row.cycle_number,
    duration: {
      planned: row.duration_planned,
      actual: row.duration_actual,
    },
    headline: row.headline,
    completed: row.completed || [],
    inProgress: row.in_progress || [],
    metricsImpact: row.metrics_impact || [],
    alignmentScore: row.alignment_score,
    ceoComment: row.ceo_comment,
    nextPriority: row.next_priority,
    createdAt: row.created_at,
  }));
}

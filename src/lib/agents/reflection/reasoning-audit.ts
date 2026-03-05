import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentRole, CycleTask, ReasoningAudit, TaskSignificanceConfig } from '../../types';
import { ClaudeClient } from '../claude-client';

const DEFAULT_SIGNIFICANCE_CONFIG: TaskSignificanceConfig = {
  minPriority: 3, // Tasks with priority <= 3 get audits
  minCostUsd: 0.02, // Tasks costing more than $0.02 get audits
  strategicKeywords: [
    'strategy', 'plan', 'decision', 'launch', 'budget', 'pricing',
    'partnership', 'hire', 'fire', 'pivot', 'invest', 'customer',
  ],
};

const AUDIT_PROMPT = `You are a reasoning quality auditor. After this agent completed their task, evaluate the quality of their reasoning and decision-making.

Analyze the task and result, then output a structured self-evaluation in this exact JSON format:

{
  "decisionSummary": "One sentence summarizing the main decision/output made",
  "rationale": ["reason1", "reason2", "reason3"],
  "assumptions": ["assumption1", "assumption2"],
  "alternativesConsidered": [
    {"option": "alternative approach", "whyRejected": "reason it wasn't chosen"}
  ],
  "risksIdentified": ["potential risk 1", "potential risk 2"],
  "confidenceScore": 75,
  "invalidationTriggers": ["what would make this decision wrong"]
}

Rules:
- confidenceScore: 0-100 (0 = no confidence, 100 = certain)
- Be honest about assumptions — hidden assumptions often cause failures
- Consider what could go wrong with this approach
- Think about what information would change this decision

Output ONLY the JSON, no markdown or explanation.`;

export function isTaskSignificant(
  task: CycleTask,
  priority: number,
  config: TaskSignificanceConfig = DEFAULT_SIGNIFICANCE_CONFIG
): boolean {
  // Priority-based significance
  if (priority <= config.minPriority) return true;

  // Cost-based significance
  if (task.costUsd > config.minCostUsd) return true;

  // Keyword-based significance
  const descLower = task.description.toLowerCase();
  const resultLower = (task.result || '').toLowerCase();
  const hasStrategicKeyword = config.strategicKeywords.some(
    (kw) => descLower.includes(kw) || resultLower.includes(kw)
  );
  if (hasStrategicKeyword) return true;

  return false;
}

export async function generateReasoningAudit(
  task: CycleTask,
  companyId: string,
  supabase: SupabaseClient
): Promise<ReasoningAudit | null> {
  if (!task.result || task.status !== 'completed') return null;

  try {
    const result = await ClaudeClient.call({
      useCase: 'memory_condensation', // Low-cost model for audit
      system: AUDIT_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Agent: ${task.agentName} (${task.agentRole})
Task: ${task.description}

Result:
${task.result.slice(0, 8000)}

Generate a reasoning audit for this completed task.`,
        },
      ],
    });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    const audit: Omit<ReasoningAudit, 'id' | 'createdAt'> = {
      taskId: task.id,
      cycleId: task.cycleId,
      companyId,
      agentRole: task.agentRole,
      decisionSummary: parsed.decisionSummary || 'No summary generated',
      rationale: parsed.rationale || [],
      assumptions: parsed.assumptions || [],
      alternativesConsidered: parsed.alternativesConsidered || [],
      risksIdentified: parsed.risksIdentified || [],
      confidenceScore: Math.min(100, Math.max(0, parsed.confidenceScore || 50)),
      invalidationTriggers: parsed.invalidationTriggers || [],
    };

    // Store in database
    const { data, error } = await supabase
      .from('reasoning_audits')
      .insert({
        task_id: audit.taskId,
        cycle_id: audit.cycleId,
        company_id: audit.companyId,
        agent_role: audit.agentRole,
        decision_summary: audit.decisionSummary,
        rationale: audit.rationale,
        assumptions: audit.assumptions,
        alternatives_considered: audit.alternativesConsidered,
        risks_identified: audit.risksIdentified,
        confidence_score: audit.confidenceScore,
        invalidation_triggers: audit.invalidationTriggers,
      })
      .select('id, created_at')
      .single();

    if (error) {
      console.error('Failed to store reasoning audit:', error);
      return null;
    }

    return {
      ...audit,
      id: data.id,
      createdAt: data.created_at,
    };
  } catch (error) {
    console.error('Reasoning audit generation failed:', error);
    return null;
  }
}

export async function getAuditsForCycle(
  cycleId: string,
  supabase: SupabaseClient
): Promise<ReasoningAudit[]> {
  const { data, error } = await supabase
    .from('reasoning_audits')
    .select('*')
    .eq('cycle_id', cycleId)
    .order('created_at', { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    taskId: row.task_id,
    cycleId: row.cycle_id,
    companyId: row.company_id,
    agentRole: row.agent_role,
    decisionSummary: row.decision_summary,
    rationale: row.rationale || [],
    assumptions: row.assumptions || [],
    alternativesConsidered: row.alternatives_considered || [],
    risksIdentified: row.risks_identified || [],
    confidenceScore: row.confidence_score,
    invalidationTriggers: row.invalidation_triggers || [],
    createdAt: row.created_at,
  }));
}

export async function getLowConfidenceAudits(
  companyId: string,
  threshold: number = 40,
  supabase: SupabaseClient
): Promise<ReasoningAudit[]> {
  const { data, error } = await supabase
    .from('reasoning_audits')
    .select('*')
    .eq('company_id', companyId)
    .lt('confidence_score', threshold)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    taskId: row.task_id,
    cycleId: row.cycle_id,
    companyId: row.company_id,
    agentRole: row.agent_role,
    decisionSummary: row.decision_summary,
    rationale: row.rationale || [],
    assumptions: row.assumptions || [],
    alternativesConsidered: row.alternatives_considered || [],
    risksIdentified: row.risks_identified || [],
    confidenceScore: row.confidence_score,
    invalidationTriggers: row.invalidation_triggers || [],
    createdAt: row.created_at,
  }));
}

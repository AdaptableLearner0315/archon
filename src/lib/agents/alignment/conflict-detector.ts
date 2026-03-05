import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentRole, AgentGoal, AlignmentConflict, AlignmentReport, ConflictSeverity } from '../../types';
import { ClaudeClient } from '../claude-client';
import { AGENT_NAMES } from '../engine';
import { v4 as uuid } from 'uuid';

const CONFLICT_DETECTION_PROMPT = `You are analyzing agent goals to detect potential conflicts between them.

Compare the two agents' goals and identify any conflicts:
- Resource conflicts: competing for same resources (leads, budget, time, data)
- Goal conflicts: optimizing for opposing objectives
- Priority conflicts: disagreeing on what's most important
- Timing conflicts: actions that should be sequenced differently

For each conflict found, output JSON:
{
  "conflicts": [
    {
      "conflictType": "resource|goal|priority|timing",
      "description": "Brief description of the conflict",
      "severity": "low|medium|high|critical",
      "suggestedResolution": "How to resolve this conflict"
    }
  ]
}

If no conflicts, output: { "conflicts": [] }

Severity guidelines:
- low: Minor friction, agents can work around it
- medium: Noticeable inefficiency, should be addressed
- high: Significant conflict that could derail outcomes
- critical: Major conflict requiring immediate human attention

Output ONLY the JSON.`;

const ALIGNMENT_SCORE_PROMPT = `You are calculating alignment scores for agents relative to the CEO's stated priorities.

Given the CEO's directive and each agent's goals, rate how well-aligned each agent is (0-100):
- 100: Perfectly aligned with CEO priorities
- 75: Mostly aligned, minor deviations
- 50: Partially aligned
- 25: Poorly aligned
- 0: Working against CEO priorities

Output JSON:
{
  "agentScores": [
    {"agent": "agentRole", "score": 85, "reason": "brief reason"}
  ],
  "overallScore": 82,
  "suggestions": ["suggestion1", "suggestion2"]
}

Output ONLY the JSON.`;

export async function detectConflicts(
  goals: AgentGoal[],
  cycleId: string,
  companyId: string,
  supabase: SupabaseClient
): Promise<AlignmentConflict[]> {
  const conflicts: AlignmentConflict[] = [];

  // Compare each pair of agents
  for (let i = 0; i < goals.length; i++) {
    for (let j = i + 1; j < goals.length; j++) {
      const goalA = goals[i];
      const goalB = goals[j];

      try {
        const result = await ClaudeClient.call({
          useCase: 'memory_condensation',
          system: CONFLICT_DETECTION_PROMPT,
          messages: [
            {
              role: 'user',
              content: `Agent A: ${AGENT_NAMES[goalA.agentRole]} (${goalA.agentRole})
Goal: ${goalA.goal}
Metrics: ${goalA.metrics.join(', ')}
Actions: ${goalA.plannedActions.join(', ')}
Resources needed: ${goalA.resourcesNeeded.join(', ')}

Agent B: ${AGENT_NAMES[goalB.agentRole]} (${goalB.agentRole})
Goal: ${goalB.goal}
Metrics: ${goalB.metrics.join(', ')}
Actions: ${goalB.plannedActions.join(', ')}
Resources needed: ${goalB.resourcesNeeded.join(', ')}

Detect any conflicts between these two agents.`,
            },
          ],
        });

        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) continue;

        const parsed = JSON.parse(jsonMatch[0]);

        for (const conflict of parsed.conflicts || []) {
          const newConflict: AlignmentConflict = {
            id: uuid(),
            cycleId,
            companyId,
            agents: [goalA.agentRole, goalB.agentRole],
            conflictType: conflict.conflictType,
            description: conflict.description,
            severity: conflict.severity as ConflictSeverity,
            resolution: null,
            resolvedBy: null,
            resolvedAt: null,
            createdAt: new Date().toISOString(),
          };

          // Auto-resolve low/medium conflicts via Atlas
          if (conflict.severity === 'low' || conflict.severity === 'medium') {
            newConflict.resolution = conflict.suggestedResolution;
            newConflict.resolvedBy = 'atlas';
            newConflict.resolvedAt = new Date().toISOString();
          }

          conflicts.push(newConflict);
        }
      } catch (error) {
        console.error(`Conflict detection failed for ${goalA.agentRole} vs ${goalB.agentRole}:`, error);
      }
    }
  }

  // Store conflicts in database
  if (conflicts.length > 0) {
    await supabase.from('alignment_conflicts').insert(
      conflicts.map((c) => ({
        id: c.id,
        cycle_id: c.cycleId,
        company_id: c.companyId,
        agent_a: c.agents[0],
        agent_b: c.agents[1],
        conflict_type: c.conflictType,
        description: c.description,
        severity: c.severity,
        resolution: c.resolution,
        resolved_by: c.resolvedBy,
        resolved_at: c.resolvedAt,
      }))
    );
  }

  return conflicts;
}

export async function calculateAlignmentScore(
  goals: AgentGoal[],
  ceoDirective: string,
  cycleId: string,
  companyId: string,
  conflicts: AlignmentConflict[],
  supabase: SupabaseClient
): Promise<AlignmentReport> {
  try {
    const goalsContext = goals
      .map(
        (g) =>
          `${AGENT_NAMES[g.agentRole]} (${g.agentRole}): ${g.goal}\n  Metrics: ${g.metrics.join(', ')}`
      )
      .join('\n\n');

    const result = await ClaudeClient.call({
      useCase: 'memory_condensation',
      system: ALIGNMENT_SCORE_PROMPT,
      messages: [
        {
          role: 'user',
          content: `CEO Directive: ${ceoDirective}

Agent Goals:
${goalsContext}

Active Conflicts: ${conflicts.filter((c) => !c.resolvedAt).length}

Calculate alignment scores for each agent.`,
        },
      ],
    });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const parsed = JSON.parse(jsonMatch[0]);

    const report: AlignmentReport = {
      cycleId,
      companyId,
      overallScore: parsed.overallScore || 50,
      agentAlignment: (parsed.agentScores || []).map((s: { agent: AgentRole; score: number }) => ({
        agent: s.agent,
        alignmentScore: s.score,
      })),
      conflicts,
      suggestions: parsed.suggestions || [],
      createdAt: new Date().toISOString(),
    };

    // Store alignment report
    await supabase.from('alignment_reports').upsert(
      {
        cycle_id: report.cycleId,
        company_id: report.companyId,
        overall_score: report.overallScore,
        agent_alignment: report.agentAlignment,
        suggestions: report.suggestions,
      },
      { onConflict: 'cycle_id' }
    );

    return report;
  } catch (error) {
    console.error('Alignment score calculation failed:', error);

    // Return default report
    return {
      cycleId,
      companyId,
      overallScore: 50,
      agentAlignment: goals.map((g) => ({ agent: g.agentRole, alignmentScore: 50 })),
      conflicts,
      suggestions: [],
      createdAt: new Date().toISOString(),
    };
  }
}

export async function getUnresolvedConflicts(
  companyId: string,
  supabase: SupabaseClient
): Promise<AlignmentConflict[]> {
  const { data, error } = await supabase
    .from('alignment_conflicts')
    .select('*')
    .eq('company_id', companyId)
    .is('resolved_at', null)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    cycleId: row.cycle_id,
    companyId: row.company_id,
    agents: [row.agent_a, row.agent_b] as [AgentRole, AgentRole],
    conflictType: row.conflict_type,
    description: row.description,
    severity: row.severity,
    resolution: row.resolution,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  }));
}

export async function resolveConflict(
  conflictId: string,
  resolution: string,
  resolvedBy: 'atlas' | 'human',
  supabase: SupabaseClient
): Promise<boolean> {
  const { error } = await supabase
    .from('alignment_conflicts')
    .update({
      resolution,
      resolved_by: resolvedBy,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', conflictId);

  return !error;
}

export async function getAlignmentReport(
  cycleId: string,
  supabase: SupabaseClient
): Promise<AlignmentReport | null> {
  const { data: reportData } = await supabase
    .from('alignment_reports')
    .select('*')
    .eq('cycle_id', cycleId)
    .single();

  if (!reportData) return null;

  const { data: conflictData } = await supabase
    .from('alignment_conflicts')
    .select('*')
    .eq('cycle_id', cycleId);

  const conflicts: AlignmentConflict[] = (conflictData || []).map((row) => ({
    id: row.id,
    cycleId: row.cycle_id,
    companyId: row.company_id,
    agents: [row.agent_a, row.agent_b] as [AgentRole, AgentRole],
    conflictType: row.conflict_type,
    description: row.description,
    severity: row.severity,
    resolution: row.resolution,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  }));

  return {
    cycleId: reportData.cycle_id,
    companyId: reportData.company_id,
    overallScore: reportData.overall_score,
    agentAlignment: reportData.agent_alignment || [],
    conflicts,
    suggestions: reportData.suggestions || [],
    createdAt: reportData.created_at,
  };
}

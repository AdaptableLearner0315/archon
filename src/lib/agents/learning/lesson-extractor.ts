import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentRole, AgentLesson, CycleRetrospective, LessonStatus } from '../../types';
import { ClaudeClient } from '../claude-client';

const LESSON_EXTRACTION_PROMPT = `You are analyzing agent performance to extract actionable lessons that could improve future behavior.

A good lesson:
1. Is specific and actionable (not vague)
2. Is based on clear evidence
3. Can be converted to a prompt instruction
4. Will measurably improve outcomes

For each potential lesson, provide:
- The lesson itself
- The evidence supporting it
- A prompt addition that would implement this learning

Output JSON:
{
  "lessons": [
    {
      "agentRole": "agent-role",
      "lesson": "Specific lesson learned",
      "evidence": "What happened that taught us this",
      "promptAddition": "LEARNED: [instruction that implements this lesson]"
    }
  ]
}

Only extract lessons with strong evidence. Quality over quantity.
Output ONLY the JSON.`;

export async function extractLessonsFromRetrospective(
  retrospective: CycleRetrospective,
  companyId: string,
  supabase: SupabaseClient
): Promise<AgentLesson[]> {
  try {
    // Get validation threshold for this company
    const { data: company } = await supabase
      .from('companies')
      .select('total_cycles_completed, lesson_validation_threshold')
      .eq('id', companyId)
      .single();

    const totalCycles = company?.total_cycles_completed || 0;
    const baseThreshold = company?.lesson_validation_threshold || 5;

    // Adaptive threshold: increases with maturity
    // 0-20 cycles: 5, 20-50 cycles: 8, 50-100 cycles: 12, 100+: 15
    let requiredCycles = baseThreshold;
    if (totalCycles > 100) requiredCycles = 15;
    else if (totalCycles > 50) requiredCycles = 12;
    else if (totalCycles > 20) requiredCycles = 8;

    const context = `
Cycle: ${retrospective.cycleId}
Overall Score: ${retrospective.overallScore}/100

What Worked:
${retrospective.whatWorked.map((w) => `- ${w}`).join('\n')}

What Didn't Work:
${retrospective.whatDidnt.map((w) => `- ${w}`).join('\n')}

Agent Scores:
${retrospective.agentScores.map((s) => `- ${s.role}: ${s.score}/100 - ${s.feedback}`).join('\n')}

Suggested Changes:
${retrospective.suggestedPromptChanges.map((c) => `- ${c.role}: ${c.suggestion}`).join('\n')}
    `.trim();

    const result = await ClaudeClient.call({
      useCase: 'memory_condensation',
      system: LESSON_EXTRACTION_PROMPT,
      messages: [
        {
          role: 'user',
          content: context,
        },
      ],
    });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    const extractedLessons: AgentLesson[] = [];

    for (const lesson of parsed.lessons || []) {
      // Check if similar lesson already exists
      const { data: existing } = await supabase
        .from('agent_lessons')
        .select('id, evidence, validation_cycles, status')
        .eq('company_id', companyId)
        .eq('agent_role', lesson.agentRole)
        .ilike('lesson', `%${lesson.lesson.slice(0, 50)}%`)
        .limit(1)
        .single();

      if (existing) {
        // Update existing lesson with new evidence
        const newEvidence = [
          ...(existing.evidence as { cycleId: string; outcome: string; relevance: string }[]),
          {
            cycleId: retrospective.cycleId,
            outcome: lesson.evidence,
            relevance: 'supportive',
          },
        ];

        const newValidationCycles = existing.validation_cycles + 1;

        // Check if lesson should be promoted
        let newStatus = existing.status as LessonStatus;
        if (existing.status === 'proposed' && newValidationCycles >= 2) {
          newStatus = 'validating';
        } else if (existing.status === 'validating' && newValidationCycles >= requiredCycles) {
          newStatus = 'active';
        }

        await supabase
          .from('agent_lessons')
          .update({
            evidence: newEvidence,
            validation_cycles: newValidationCycles,
            status: newStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        // Create new lesson
        const { data, error } = await supabase
          .from('agent_lessons')
          .insert({
            company_id: companyId,
            agent_role: lesson.agentRole,
            lesson: lesson.lesson,
            evidence: [
              {
                cycleId: retrospective.cycleId,
                outcome: lesson.evidence,
                relevance: 'initial',
              },
            ],
            status: 'proposed',
            prompt_addition: lesson.promptAddition,
            required_cycles: requiredCycles,
            validation_cycles: 1,
          })
          .select()
          .single();

        if (!error && data) {
          extractedLessons.push({
            id: data.id,
            companyId: data.company_id,
            agentRole: data.agent_role,
            lesson: data.lesson,
            evidence: data.evidence,
            status: data.status,
            promptAddition: data.prompt_addition,
            requiredCycles: data.required_cycles,
            validationCycles: data.validation_cycles,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          });
        }
      }
    }

    return extractedLessons;
  } catch (error) {
    console.error('Lesson extraction failed:', error);
    return [];
  }
}

export async function getActiveLessonsForAgent(
  companyId: string,
  agentRole: AgentRole,
  supabase: SupabaseClient
): Promise<AgentLesson[]> {
  const { data, error } = await supabase
    .from('agent_lessons')
    .select('*')
    .eq('company_id', companyId)
    .eq('agent_role', agentRole)
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    agentRole: row.agent_role,
    lesson: row.lesson,
    evidence: row.evidence || [],
    status: row.status,
    promptAddition: row.prompt_addition,
    impactMetrics: row.impact_before && row.impact_after
      ? { before: row.impact_before, after: row.impact_after }
      : undefined,
    requiredCycles: row.required_cycles,
    validationCycles: row.validation_cycles,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function getAllLessonsForCompany(
  companyId: string,
  supabase: SupabaseClient
): Promise<AgentLesson[]> {
  const { data, error } = await supabase
    .from('agent_lessons')
    .select('*')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    agentRole: row.agent_role,
    lesson: row.lesson,
    evidence: row.evidence || [],
    status: row.status,
    promptAddition: row.prompt_addition,
    impactMetrics: row.impact_before && row.impact_after
      ? { before: row.impact_before, after: row.impact_after }
      : undefined,
    requiredCycles: row.required_cycles,
    validationCycles: row.validation_cycles,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function deprecateLesson(
  lessonId: string,
  reason: string,
  supabase: SupabaseClient
): Promise<boolean> {
  const { error } = await supabase
    .from('agent_lessons')
    .update({
      status: 'deprecated',
      updated_at: new Date().toISOString(),
    })
    .eq('id', lessonId);

  return !error;
}

export async function recordLessonImpact(
  lessonId: string,
  performanceBefore: number,
  performanceAfter: number,
  supabase: SupabaseClient
): Promise<boolean> {
  const { error } = await supabase
    .from('agent_lessons')
    .update({
      impact_before: performanceBefore,
      impact_after: performanceAfter,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lessonId);

  return !error;
}

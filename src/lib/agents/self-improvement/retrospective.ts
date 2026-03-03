import type { SupabaseClient } from '@supabase/supabase-js';
import type { CycleRetrospective, CycleTask, AgentMessage } from '../../types';
import { ClaudeClient } from '../claude-client';
import { CostTracker } from '../cost-tracker';
import { scoreAgentInCycle } from './scorer';

export async function runRetrospective(
  cycleId: string,
  companyId: string,
  tasks: CycleTask[],
  messages: AgentMessage[],
  supabase: SupabaseClient
): Promise<CycleRetrospective> {
  // Score all agents
  const uniqueRoles = [...new Set(tasks.map((t) => t.agentRole))];
  const performanceRecords = await Promise.all(
    uniqueRoles.map((role) => scoreAgentInCycle(companyId, cycleId, role, tasks, supabase))
  );

  const taskSummary = tasks.map((t) => ({
    agent: t.agentRole,
    task: t.description.slice(0, 200),
    status: t.status,
    tokens: t.tokensUsed,
    cost: t.costUsd,
    error: t.error?.slice(0, 100) || null,
  }));

  const messageSummary = messages.slice(0, 20).map((m) => ({
    from: m.fromRole,
    to: m.toRole,
    type: m.type,
    subject: m.subject,
  }));

  const perfSummary = performanceRecords.map((p) => ({
    agent: p.agentRole,
    score: p.score,
    completed: p.tasksCompleted,
    failed: p.tasksFailed,
    cost: p.totalCostUsd,
  }));

  const result = await ClaudeClient.call({
    useCase: 'retrospective',
    system: `You are conducting a post-cycle retrospective for an AI-powered autonomous company.

Analyze the cycle results and produce a structured retrospective.

Output EXACTLY in this JSON format (no markdown code blocks):
{
  "whatWorked": ["item1", "item2"],
  "whatDidnt": ["item1", "item2"],
  "agentScores": [
    {"role": "agent-role", "score": 0-100, "feedback": "brief feedback"}
  ],
  "suggestedPromptChanges": [
    {"role": "agent-role", "suggestion": "specific change to make"}
  ],
  "overallScore": 0-100
}

Be specific and actionable. Score fairly based on actual outputs.`,
    messages: [{
      role: 'user',
      content: JSON.stringify({ tasks: taskSummary, communication: messageSummary, performance: perfSummary }),
    }],
  });

  CostTracker.record(cycleId, 'ceo', result.usage, result.costUsd);

  try {
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid retrospective output');

    const retro = JSON.parse(jsonMatch[0]) as Omit<CycleRetrospective, 'cycleId' | 'companyId' | 'createdAt'>;

    const fullRetro: CycleRetrospective = {
      ...retro,
      cycleId,
      companyId,
      createdAt: new Date().toISOString(),
    };

    await supabase.from('weekly_retros').insert({
      company_id: companyId,
      summary: `Cycle ${cycleId}: ${fullRetro.whatWorked.join('; ')}`,
      top_insight: fullRetro.whatDidnt[0] || 'No issues detected',
      agent_performance: fullRetro.agentScores,
    });

    return fullRetro;
  } catch {
    return {
      cycleId,
      companyId,
      whatWorked: ['Cycle completed'],
      whatDidnt: ['Unable to analyze cycle in detail'],
      agentScores: performanceRecords.map((p) => ({
        role: p.agentRole,
        score: p.score,
        feedback: `Completed ${p.tasksCompleted} tasks, failed ${p.tasksFailed}`,
      })),
      suggestedPromptChanges: [],
      overallScore: Math.round(
        performanceRecords.reduce((sum, p) => sum + p.score, 0) / Math.max(performanceRecords.length, 1)
      ),
      createdAt: new Date().toISOString(),
    };
  }
}

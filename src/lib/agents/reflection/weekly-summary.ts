import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentRole, WeeklyReflectionSummary, AgentTrend } from '../../types';
import { ClaudeClient } from '../claude-client';
import { AGENT_NAMES } from '../engine';
import { extractLessonsFromRetrospective } from '../learning';

const WEEKLY_SUMMARY_PROMPT = `You are Atlas (CEO) generating a comprehensive weekly reflection summary.

Analyze the week's cycles, agent performance, and business outcomes to create:
1. Top 3 wins with impact
2. Top 3 concerns with risk assessment
3. Agent rankings with trends
4. CEO strategic assessment
5. Recommended human actions

Output JSON:
{
  "wins": [
    {"what": "achievement description", "impact": "business impact", "agent": "agent-role"}
  ],
  "concerns": [
    {"what": "concern description", "risk": "potential risk", "owner": "agent-role"}
  ],
  "agentRankings": [
    {"agent": "agent-role", "score": 85, "trend": "up|down|stable"}
  ],
  "lessonsLearned": [
    {"lesson": "what we learned", "evidence": "supporting data", "agentRole": "agent-role"}
  ],
  "ceoAssessment": {
    "whatWorked": "summary of successes",
    "whatDidnt": "summary of failures",
    "focusNextWeek": "recommended priority",
    "riskToWatch": "key risk to monitor"
  },
  "humanActions": [
    {"action": "what human should do", "urgency": "now|soon|later", "context": "why this matters"}
  ]
}

Be specific, actionable, and strategic. Output ONLY the JSON.`;

export async function generateWeeklySummary(
  companyId: string,
  supabase: SupabaseClient
): Promise<WeeklyReflectionSummary | null> {
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const weekOf = new Date().toISOString().split('T')[0];

    // Check if we already have a summary for this week
    const { data: existing } = await supabase
      .from('weekly_reflection_summaries')
      .select('id')
      .eq('company_id', companyId)
      .eq('week_of', weekOf)
      .single();

    if (existing) return null;

    // Gather week's data
    const { data: cycles } = await supabase
      .from('operating_cycles')
      .select('id, plan, total_cost_usd, completed_at')
      .eq('company_id', companyId)
      .eq('status', 'done')
      .gte('completed_at', oneWeekAgo)
      .order('completed_at', { ascending: false });

    const cycleIds = (cycles || []).map((c) => c.id);
    const cyclesCompleted = cycleIds.length;

    if (cyclesCompleted === 0) return null;

    // Get agent performance for the week
    const { data: performances } = await supabase
      .from('agent_performance')
      .select('agent_role, score, tasks_completed, tasks_failed')
      .eq('company_id', companyId)
      .in('cycle_id', cycleIds);

    // Get previous week's performances for trend
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: prevCycles } = await supabase
      .from('operating_cycles')
      .select('id')
      .eq('company_id', companyId)
      .eq('status', 'done')
      .gte('completed_at', twoWeeksAgo)
      .lt('completed_at', oneWeekAgo);

    const prevCycleIds = (prevCycles || []).map((c) => c.id);

    const { data: prevPerformances } = await supabase
      .from('agent_performance')
      .select('agent_role, score')
      .eq('company_id', companyId)
      .in('cycle_id', prevCycleIds);

    // Calculate agent scores and trends
    const agentScores = new Map<AgentRole, { scores: number[]; prevScores: number[] }>();

    for (const perf of performances || []) {
      const existing = agentScores.get(perf.agent_role as AgentRole) || { scores: [], prevScores: [] };
      existing.scores.push(perf.score);
      agentScores.set(perf.agent_role as AgentRole, existing);
    }

    for (const perf of prevPerformances || []) {
      const existing = agentScores.get(perf.agent_role as AgentRole) || { scores: [], prevScores: [] };
      existing.prevScores.push(perf.score);
      agentScores.set(perf.agent_role as AgentRole, existing);
    }

    // Get alignment data
    const { data: alignmentReports } = await supabase
      .from('alignment_reports')
      .select('overall_score')
      .in('cycle_id', cycleIds);

    const avgAlignment = alignmentReports?.length
      ? alignmentReports.reduce((sum, r) => sum + (r.overall_score || 0), 0) / alignmentReports.length
      : 100;

    const { data: prevAlignmentReports } = await supabase
      .from('alignment_reports')
      .select('overall_score')
      .in('cycle_id', prevCycleIds);

    const prevAvgAlignment = prevAlignmentReports?.length
      ? prevAlignmentReports.reduce((sum, r) => sum + (r.overall_score || 0), 0) / prevAlignmentReports.length
      : 100;

    // Get conflict count
    const { count: conflictCount } = await supabase
      .from('alignment_conflicts')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('cycle_id', cycleIds)
      .is('resolved_at', null);

    // Build context for Claude
    const performanceContext = Array.from(agentScores.entries())
      .map(([role, data]) => {
        const avgScore = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
        const prevAvg = data.prevScores.length
          ? data.prevScores.reduce((a, b) => a + b, 0) / data.prevScores.length
          : avgScore;
        const trend = avgScore > prevAvg + 5 ? 'improving' : avgScore < prevAvg - 5 ? 'declining' : 'stable';
        return `${AGENT_NAMES[role] || role}: ${avgScore.toFixed(0)}/100 (${trend})`;
      })
      .join('\n');

    const cycleContext = (cycles || [])
      .slice(0, 5)
      .map((c) => {
        const plan = c.plan as { directive?: string } | null;
        return `- ${plan?.directive || 'Cycle'} ($${c.total_cost_usd?.toFixed(2) || '0'})`;
      })
      .join('\n');

    const result = await ClaudeClient.call({
      useCase: 'memory_condensation',
      system: WEEKLY_SUMMARY_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Weekly Reflection Summary
Week of: ${weekOf}
Cycles Completed: ${cyclesCompleted}

Agent Performance:
${performanceContext}

Recent Cycles:
${cycleContext}

Alignment: ${avgAlignment.toFixed(0)}% (prev: ${prevAvgAlignment.toFixed(0)}%)
Unresolved Conflicts: ${conflictCount || 0}

Generate the comprehensive weekly summary.`,
        },
      ],
    });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    // Build agent rankings with trends
    const agentRankings = Array.from(agentScores.entries()).map(([role, data]) => {
      const avgScore = Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length);
      const prevAvg = data.prevScores.length
        ? data.prevScores.reduce((a, b) => a + b, 0) / data.prevScores.length
        : avgScore;
      const trend: AgentTrend = avgScore > prevAvg + 5 ? 'up' : avgScore < prevAvg - 5 ? 'down' : 'stable';
      return { agent: role, score: avgScore, trend };
    }).sort((a, b) => b.score - a.score);

    const summary: Omit<WeeklyReflectionSummary, 'id' | 'createdAt'> = {
      companyId,
      weekOf,
      cyclesCompleted,
      wins: parsed.wins || [],
      concerns: parsed.concerns || [],
      agentRankings: agentRankings.length ? agentRankings : (parsed.agentRankings || []),
      lessonsLearned: parsed.lessonsLearned || [],
      alignmentTrend: {
        score: Math.round(avgAlignment),
        previousScore: Math.round(prevAvgAlignment),
        conflicts: conflictCount || 0,
      },
      ceoAssessment: parsed.ceoAssessment || {
        whatWorked: 'Analysis not available',
        whatDidnt: 'Analysis not available',
        focusNextWeek: 'Continue current priorities',
        riskToWatch: 'Monitor overall performance',
      },
      humanActions: parsed.humanActions || [],
    };

    // Store in database
    const { data, error } = await supabase
      .from('weekly_reflection_summaries')
      .insert({
        company_id: summary.companyId,
        week_of: summary.weekOf,
        cycles_completed: summary.cyclesCompleted,
        wins: summary.wins,
        concerns: summary.concerns,
        agent_rankings: summary.agentRankings,
        lessons_learned: summary.lessonsLearned,
        alignment_trend: summary.alignmentTrend,
        ceo_assessment: summary.ceoAssessment,
        human_actions: summary.humanActions,
      })
      .select('id, created_at')
      .single();

    if (error) {
      console.error('Failed to store weekly summary:', error);
      return null;
    }

    return {
      ...summary,
      id: data.id,
      createdAt: data.created_at,
    };
  } catch (error) {
    console.error('Weekly summary generation failed:', error);
    return null;
  }
}

export async function getWeeklySummary(
  companyId: string,
  weekOf: string,
  supabase: SupabaseClient
): Promise<WeeklyReflectionSummary | null> {
  const { data, error } = await supabase
    .from('weekly_reflection_summaries')
    .select('*')
    .eq('company_id', companyId)
    .eq('week_of', weekOf)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    companyId: data.company_id,
    weekOf: data.week_of,
    cyclesCompleted: data.cycles_completed,
    wins: data.wins || [],
    concerns: data.concerns || [],
    agentRankings: data.agent_rankings || [],
    lessonsLearned: data.lessons_learned || [],
    alignmentTrend: data.alignment_trend,
    ceoAssessment: data.ceo_assessment,
    humanActions: data.human_actions || [],
    createdAt: data.created_at,
  };
}

export async function getRecentWeeklySummaries(
  companyId: string,
  limit: number = 4,
  supabase: SupabaseClient
): Promise<WeeklyReflectionSummary[]> {
  const { data, error } = await supabase
    .from('weekly_reflection_summaries')
    .select('*')
    .eq('company_id', companyId)
    .order('week_of', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    weekOf: row.week_of,
    cyclesCompleted: row.cycles_completed,
    wins: row.wins || [],
    concerns: row.concerns || [],
    agentRankings: row.agent_rankings || [],
    lessonsLearned: row.lessons_learned || [],
    alignmentTrend: row.alignment_trend,
    ceoAssessment: row.ceo_assessment,
    humanActions: row.human_actions || [],
    createdAt: row.created_at,
  }));
}

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentRole, UserJourneyReview, JourneyStage, JourneyHealth } from '../../types';
import { ClaudeClient } from '../claude-client';
import { AGENT_NAMES } from '../engine';

const JOURNEY_REVIEW_PROMPT = `You are conducting a bi-weekly user journey review where all agents reflect on the customer experience.

Analyze the agent activities and cycle outcomes to identify:
1. Each agent's touchpoints with users
2. Friction points in the journey
3. Improvement opportunities
4. Overall health of each journey stage

Output JSON:
{
  "agentReflections": [
    {
      "agent": "agent-role",
      "touchpoints": ["where they interact with users"],
      "frictionPoints": ["where users struggle"],
      "improvements": ["suggested enhancements"]
    }
  ],
  "journeyStages": [
    {
      "stage": "awareness|consideration|purchase|onboarding|usage|retention",
      "health": "healthy|needs-attention|critical",
      "ownerAgents": ["agent-role"],
      "issues": ["identified issues"],
      "actions": ["recommended actions"]
    }
  ],
  "experienceScore": 75
}

Be specific and actionable. Focus on real friction points, not hypotheticals.
Output ONLY the JSON.`;

const JOURNEY_STAGE_OWNERS: Record<JourneyStage, AgentRole[]> = {
  awareness: ['marketing', 'seo', 'ads'],
  consideration: ['marketing', 'sales', 'product'],
  purchase: ['sales', 'product', 'support'],
  onboarding: ['product', 'support', 'customer-success'],
  usage: ['product', 'engineer', 'support'],
  retention: ['customer-success', 'support', 'growth'],
};

export async function runUserJourneyReview(
  companyId: string,
  supabase: SupabaseClient
): Promise<UserJourneyReview | null> {
  // Check if we already ran a review in the last 2 weeks
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentReview } = await supabase
    .from('user_journey_reviews')
    .select('id')
    .eq('company_id', companyId)
    .gte('created_at', twoWeeksAgo)
    .limit(1)
    .single();

  if (recentReview) {
    return null; // Already ran recently
  }

  try {
    // Gather context from recent cycles
    const { data: recentCycles } = await supabase
      .from('operating_cycles')
      .select('id, plan, completed_at')
      .eq('company_id', companyId)
      .eq('status', 'done')
      .order('completed_at', { ascending: false })
      .limit(14); // Last ~2 weeks of cycles

    const { data: recentTasks } = await supabase
      .from('cycle_tasks')
      .select('agent_role, agent_name, description, status, result')
      .eq('company_id', companyId)
      .in('cycle_id', (recentCycles || []).map((c) => c.id))
      .order('created_at', { ascending: false })
      .limit(50);

    const { data: recentReflections } = await supabase
      .from('agent_reflections')
      .select('summary, recommendations')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(2);

    // Build context
    const taskSummary = (recentTasks || [])
      .map((t) => `${AGENT_NAMES[t.agent_role as AgentRole] || t.agent_role}: ${t.description.slice(0, 100)} [${t.status}]`)
      .join('\n');

    const reflectionSummary = (recentReflections || [])
      .map((r) => {
        const summary = r.summary as { topWin?: string; topConcern?: string };
        return `Win: ${summary.topWin || 'N/A'}, Concern: ${summary.topConcern || 'N/A'}`;
      })
      .join('\n');

    const result = await ClaudeClient.call({
      useCase: 'memory_condensation',
      system: JOURNEY_REVIEW_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Bi-Weekly User Journey Review

Recent Agent Activities (${(recentTasks || []).length} tasks):
${taskSummary}

Recent Reflections:
${reflectionSummary}

Conduct a comprehensive review of the user journey across all stages.`,
        },
      ],
    });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    // Ensure all journey stages are covered
    const journeyStages = (parsed.journeyStages || []).map((stage: {
      stage: JourneyStage;
      health: JourneyHealth;
      ownerAgents: AgentRole[];
      issues: string[];
      actions: string[];
    }) => ({
      stage: stage.stage,
      health: stage.health,
      ownerAgents: stage.ownerAgents || JOURNEY_STAGE_OWNERS[stage.stage] || [],
      issues: stage.issues || [],
      actions: stage.actions || [],
    }));

    const review: Omit<UserJourneyReview, 'id' | 'createdAt'> = {
      companyId,
      reviewDate: new Date().toISOString().split('T')[0],
      agentReflections: parsed.agentReflections || [],
      journeyStages,
      experienceScore: Math.min(100, Math.max(0, parsed.experienceScore || 50)),
    };

    // Store in database
    const { data, error } = await supabase
      .from('user_journey_reviews')
      .insert({
        company_id: review.companyId,
        review_date: review.reviewDate,
        agent_reflections: review.agentReflections,
        journey_stages: review.journeyStages,
        experience_score: review.experienceScore,
      })
      .select('id, created_at')
      .single();

    if (error) {
      console.error('Failed to store user journey review:', error);
      return null;
    }

    return {
      ...review,
      id: data.id,
      createdAt: data.created_at,
    };
  } catch (error) {
    console.error('User journey review failed:', error);
    return null;
  }
}

export async function getLatestJourneyReview(
  companyId: string,
  supabase: SupabaseClient
): Promise<UserJourneyReview | null> {
  const { data, error } = await supabase
    .from('user_journey_reviews')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    companyId: data.company_id,
    reviewDate: data.review_date,
    agentReflections: data.agent_reflections || [],
    journeyStages: data.journey_stages || [],
    experienceScore: data.experience_score,
    createdAt: data.created_at,
  };
}

export async function getJourneyReviewHistory(
  companyId: string,
  limit: number = 6,
  supabase: SupabaseClient
): Promise<UserJourneyReview[]> {
  const { data, error } = await supabase
    .from('user_journey_reviews')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    reviewDate: row.review_date,
    agentReflections: row.agent_reflections || [],
    journeyStages: row.journey_stages || [],
    experienceScore: row.experience_score,
    createdAt: row.created_at,
  }));
}

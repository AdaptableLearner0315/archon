import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentRole, AgentGoal, CyclePlan } from '../../types';
import { ClaudeClient } from '../claude-client';
import { AGENT_NAMES } from '../engine';

const GOAL_EXTRACTION_PROMPT = `You are analyzing an agent's task to extract their goals for this cycle.

Given the agent role and task description, identify:
1. The primary goal they're optimizing for
2. What metrics they care about
3. What actions they plan to take
4. What resources they need

Output in this exact JSON format:
{
  "goal": "What the agent is trying to achieve",
  "metrics": ["metric1", "metric2"],
  "plannedActions": ["action1", "action2"],
  "resourcesNeeded": ["resource1"]
}

Be specific and practical. Output ONLY the JSON.`;

export async function registerGoalsForCycle(
  cycleId: string,
  companyId: string,
  plan: CyclePlan,
  supabase: SupabaseClient
): Promise<AgentGoal[]> {
  const goals: AgentGoal[] = [];

  for (const task of plan.tasks) {
    try {
      const result = await ClaudeClient.call({
        useCase: 'memory_condensation',
        system: GOAL_EXTRACTION_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Agent: ${AGENT_NAMES[task.agentRole]} (${task.agentRole})
Task: ${task.description}
Priority: ${task.priority}

Extract the goals for this agent.`,
          },
        ],
      });

      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;

      const parsed = JSON.parse(jsonMatch[0]);

      const goal: Omit<AgentGoal, 'id' | 'createdAt'> = {
        cycleId,
        companyId,
        agentRole: task.agentRole,
        goal: parsed.goal || task.description,
        metrics: parsed.metrics || [],
        plannedActions: parsed.plannedActions || [],
        resourcesNeeded: parsed.resourcesNeeded || [],
      };

      const { data, error } = await supabase
        .from('agent_goals')
        .upsert(
          {
            cycle_id: goal.cycleId,
            company_id: goal.companyId,
            agent_role: goal.agentRole,
            goal: goal.goal,
            metrics: goal.metrics,
            planned_actions: goal.plannedActions,
            resources_needed: goal.resourcesNeeded,
          },
          { onConflict: 'cycle_id,agent_role' }
        )
        .select('id, created_at')
        .single();

      if (!error && data) {
        goals.push({
          ...goal,
          id: data.id,
          createdAt: data.created_at,
        });
      }
    } catch (error) {
      console.error(`Failed to register goal for ${task.agentRole}:`, error);
    }
  }

  return goals;
}

export async function getGoalsForCycle(
  cycleId: string,
  supabase: SupabaseClient
): Promise<AgentGoal[]> {
  const { data, error } = await supabase
    .from('agent_goals')
    .select('*')
    .eq('cycle_id', cycleId)
    .order('created_at', { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    cycleId: row.cycle_id,
    companyId: row.company_id,
    agentRole: row.agent_role,
    goal: row.goal,
    metrics: row.metrics || [],
    plannedActions: row.planned_actions || [],
    resourcesNeeded: row.resources_needed || [],
    createdAt: row.created_at,
  }));
}

export async function getAgentGoalHistory(
  companyId: string,
  agentRole: AgentRole,
  limit: number = 10,
  supabase: SupabaseClient
): Promise<AgentGoal[]> {
  const { data, error } = await supabase
    .from('agent_goals')
    .select('*')
    .eq('company_id', companyId)
    .eq('agent_role', agentRole)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    cycleId: row.cycle_id,
    companyId: row.company_id,
    agentRole: row.agent_role,
    goal: row.goal,
    metrics: row.metrics || [],
    plannedActions: row.planned_actions || [],
    resourcesNeeded: row.resources_needed || [],
    createdAt: row.created_at,
  }));
}

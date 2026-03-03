import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentRole, CyclePlan, CycleStreamEvent } from '../../types';
import { ClaudeClient } from '../claude-client';
import { CostTracker } from '../cost-tracker';
import type { ContextBuilder } from '../memory/context-builder';

const STARTER_AGENTS: AgentRole[] = ['ceo', 'engineer', 'growth', 'marketing'];
const ALL_AGENTS: AgentRole[] = ['ceo', 'engineer', 'growth', 'marketing', 'product', 'operations', 'sales', 'support', 'data-analyst', 'customer-success'];

function getAvailableAgents(plan: string): AgentRole[] {
  return plan === 'starter' ? STARTER_AGENTS : ALL_AGENTS;
}

export async function planCycle(
  cycleId: string,
  companyId: string,
  companyContext: string,
  companyPlan: string,
  userDirective: string | null,
  contextBuilder: ContextBuilder,
  supabase: SupabaseClient,
  onEvent: (event: CycleStreamEvent) => void
): Promise<CyclePlan> {
  const availableAgents = getAvailableAgents(companyPlan);

  // Load CEO memory context
  const memoryContext = await contextBuilder.buildContext(companyId, 'ceo', 'cycle planning');
  const memoryStr = contextBuilder.formatForPrompt(memoryContext);

  // Load last 3 completed cycles for continuity
  const { data: recentCycles } = await supabase
    .from('operating_cycles')
    .select('plan, completed_at, total_cost_usd')
    .eq('company_id', companyId)
    .eq('status', 'done')
    .order('completed_at', { ascending: false })
    .limit(3);

  const cycleHistory = (recentCycles || [])
    .map((c, i) => {
      const plan = c.plan as CyclePlan | null;
      return `Cycle ${i + 1}: ${plan?.directive ?? 'N/A'} (cost: $${c.total_cost_usd?.toFixed(4) ?? '0'})`;
    })
    .join('\n');

  const systemPrompt = `You are Atlas, the CEO agent of an AI-powered autonomous company. You are planning the next operating cycle.

${memoryStr ? `\n${memoryStr}\n` : ''}
Company Context:
${companyContext}

Available Agents: ${availableAgents.join(', ')}

${cycleHistory ? `Recent Cycle History:\n${cycleHistory}\n` : ''}

Your job: Create a structured execution plan for this cycle. Consider what tasks will move the business forward most effectively.

Output EXACTLY in this JSON format (no markdown code blocks, just raw JSON):
{
  "directive": "A clear 1-sentence description of this cycle's focus",
  "tasks": [
    {
      "agentRole": "agent-role-here",
      "description": "Specific, actionable task description (2-3 sentences). Include exactly what the agent should produce.",
      "priority": 1,
      "dependsOn": []
    }
  ],
  "reasoning": "Brief explanation of why you chose these tasks and priorities"
}

Rules:
- Only assign tasks to available agents: ${availableAgents.join(', ')}
- Priority 1 = highest, 5 = lowest
- dependsOn is an array of agentRoles whose tasks must complete first
- Each task should produce a concrete deliverable
- Be specific — "Write 3 social media posts about X" not "Do marketing"
- CEO (you) should have a task for strategy/coordination
- Maximum 1 task per agent per cycle`;

  onEvent({
    type: 'cycle_status',
    cycleId,
    status: 'planning',
    content: 'Atlas (CEO) is planning the cycle...',
    timestamp: new Date().toISOString(),
  });

  const userMessage = userDirective
    ? `Plan the next cycle with this directive from the founder: "${userDirective}"`
    : 'Plan the next cycle. Analyze what the company needs most right now and create tasks accordingly.';

  const result = await ClaudeClient.call({
    useCase: 'ceo_planning',
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  CostTracker.record(cycleId, 'ceo', result.usage, result.costUsd);

  try {
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('CEO did not produce valid JSON plan');

    const plan = JSON.parse(jsonMatch[0]) as CyclePlan;

    if (!plan.tasks || !Array.isArray(plan.tasks) || plan.tasks.length === 0) {
      throw new Error('Plan has no tasks');
    }

    // Filter to available agents only
    plan.tasks = plan.tasks.filter((t) => availableAgents.includes(t.agentRole));

    // Validate dependencies
    for (const task of plan.tasks) {
      task.dependsOn = (task.dependsOn || []).filter((dep) =>
        plan.tasks.some((t) => t.agentRole === dep)
      );
    }

    onEvent({
      type: 'cycle_status',
      cycleId,
      status: 'planning',
      content: `Plan created: ${plan.directive} (${plan.tasks.length} tasks)`,
      timestamp: new Date().toISOString(),
    });

    return plan;
  } catch {
    // Fallback plan
    return {
      directive: userDirective || 'General business advancement cycle',
      tasks: availableAgents.map((role, i) => ({
        agentRole: role,
        description: `Analyze current state and produce actionable recommendations for your domain (${role}).`,
        priority: role === 'ceo' ? 1 : i + 2,
        dependsOn: role === 'ceo' ? [] : ['ceo' as AgentRole],
      })),
      reasoning: 'Fallback plan — CEO planning output could not be parsed.',
    };
  }
}

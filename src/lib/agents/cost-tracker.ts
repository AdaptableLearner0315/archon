import type { AgentRole } from '../types';
import type { SupabaseClient } from '@supabase/supabase-js';

interface CostEntry {
  agentRole: AgentRole;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  timestamp: number;
}

const DEFAULT_MAX_OUTPUT_TOKENS = 50_000;

class CostTrackerSingleton {
  private cycleCosts: Map<string, CostEntry[]> = new Map();
  private static instance: CostTrackerSingleton;

  private constructor() {}

  static getInstance(): CostTrackerSingleton {
    if (!CostTrackerSingleton.instance) {
      CostTrackerSingleton.instance = new CostTrackerSingleton();
    }
    return CostTrackerSingleton.instance;
  }

  record(
    cycleId: string,
    agentRole: AgentRole,
    usage: { inputTokens: number; outputTokens: number },
    costUsd: number
  ): void {
    if (!this.cycleCosts.has(cycleId)) {
      this.cycleCosts.set(cycleId, []);
    }
    this.cycleCosts.get(cycleId)!.push({
      agentRole,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd,
      timestamp: Date.now(),
    });
  }

  getCycleTotalCost(cycleId: string): number {
    const entries = this.cycleCosts.get(cycleId) || [];
    return entries.reduce((sum, e) => sum + e.costUsd, 0);
  }

  getCycleTotalOutputTokens(cycleId: string): number {
    const entries = this.cycleCosts.get(cycleId) || [];
    return entries.reduce((sum, e) => sum + e.outputTokens, 0);
  }

  getAgentCost(cycleId: string, agentRole: AgentRole): { tokens: number; cost: number } {
    const entries = (this.cycleCosts.get(cycleId) || []).filter((e) => e.agentRole === agentRole);
    return {
      tokens: entries.reduce((sum, e) => sum + e.inputTokens + e.outputTokens, 0),
      cost: entries.reduce((sum, e) => sum + e.costUsd, 0),
    };
  }

  checkBudget(cycleId: string, maxOutputTokens: number = DEFAULT_MAX_OUTPUT_TOKENS): boolean {
    return this.getCycleTotalOutputTokens(cycleId) < maxOutputTokens;
  }

  async persistToDb(cycleId: string, supabase: SupabaseClient): Promise<void> {
    const entries = this.cycleCosts.get(cycleId);
    if (!entries || entries.length === 0) return;

    // Aggregate by agent role
    const byAgent = new Map<string, { inputTokens: number; outputTokens: number; costUsd: number }>();
    for (const entry of entries) {
      const key = entry.agentRole;
      const existing = byAgent.get(key) || { inputTokens: 0, outputTokens: 0, costUsd: 0 };
      existing.inputTokens += entry.inputTokens;
      existing.outputTokens += entry.outputTokens;
      existing.costUsd += entry.costUsd;
      byAgent.set(key, existing);
    }

    // Update cycle_tasks with cost data
    for (const [agentRole, data] of byAgent) {
      await supabase
        .from('cycle_tasks')
        .update({
          tokens_used: data.inputTokens + data.outputTokens,
          cost_usd: data.costUsd,
        })
        .eq('cycle_id', cycleId)
        .eq('agent_role', agentRole);
    }

    // Update operating_cycles total
    const totalCost = entries.reduce((sum, e) => sum + e.costUsd, 0);
    const totalTokens = entries.reduce((sum, e) => sum + e.inputTokens + e.outputTokens, 0);
    await supabase
      .from('operating_cycles')
      .update({ total_cost_usd: totalCost, total_tokens_used: totalTokens })
      .eq('id', cycleId);
  }

  cleanup(cycleId: string): void {
    this.cycleCosts.delete(cycleId);
  }
}

export const CostTracker = CostTrackerSingleton.getInstance();

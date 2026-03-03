import type { SupabaseClient } from '@supabase/supabase-js';
import type { OperatingCycle, CycleStatus, CycleTrigger, CycleStreamEvent } from '../../types';
import { planCycle } from './cycle-planner';
import { executeCycle } from './cycle-executor';
import { CostTracker } from '../cost-tracker';
import { WorkingMemory } from '../memory/working-memory';
import { ShortTermMemoryStore } from '../memory/short-term';
import { LongTermMemoryStore } from '../memory/long-term';
import { ContextBuilder } from '../memory/context-builder';
import { MessageBus } from '../message-bus';
import type { TaskRunnerDeps } from './task-runner';
import { v4 as uuid } from 'uuid';

// In-memory concurrency lock
const activeCycles = new Map<string, string>(); // companyId → cycleId

export async function startCycle(
  companyId: string,
  trigger: CycleTrigger,
  userDirective: string | null,
  supabase: SupabaseClient,
  onEvent: (event: CycleStreamEvent) => void
): Promise<OperatingCycle> {
  // Concurrency guard
  if (activeCycles.has(companyId)) {
    throw new Error(`Company ${companyId} already has an active cycle: ${activeCycles.get(companyId)}`);
  }

  // DB-level concurrency check
  const { data: existingActive } = await supabase
    .from('operating_cycles')
    .select('id')
    .eq('company_id', companyId)
    .in('status', ['pending', 'planning', 'executing', 'completing'])
    .limit(1);

  if (existingActive && existingActive.length > 0) {
    throw new Error(`Company already has an active cycle: ${existingActive[0].id}`);
  }

  const cycleId = uuid();
  activeCycles.set(companyId, cycleId);

  // Create cycle row
  const { data: cycleRow, error: insertError } = await supabase
    .from('operating_cycles')
    .insert({
      id: cycleId,
      company_id: companyId,
      status: 'pending',
      trigger,
      user_directive: userDirective,
    })
    .select()
    .single();

  if (insertError || !cycleRow) {
    activeCycles.delete(companyId);
    throw new Error(`Failed to create cycle: ${insertError?.message}`);
  }

  // Load company
  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single();

  if (!company) {
    activeCycles.delete(companyId);
    throw new Error('Company not found');
  }

  const companyContext = `
Company: ${company.name}
Description: ${company.description}
Goal: ${company.goal}
Ad Budget: ${company.ad_budget}
Plan: ${company.plan}
  `.trim();

  // Initialize subsystems
  const workingMemory = new WorkingMemory(cycleId);
  const stmStore = new ShortTermMemoryStore(supabase);
  const ltmStore = new LongTermMemoryStore(supabase);
  const contextBuilder = new ContextBuilder(workingMemory, stmStore, ltmStore);
  const messageBus = new MessageBus(cycleId, companyId, supabase);

  const cycle: OperatingCycle = {
    id: cycleId,
    companyId,
    status: 'pending',
    trigger,
    plan: null,
    userDirective,
    totalTokensUsed: 0,
    totalCostUsd: 0,
    startedAt: cycleRow.started_at,
    completedAt: null,
    error: null,
  };

  try {
    // --- PLANNING ---
    await updateCycleStatus(cycleId, 'planning', supabase);
    cycle.status = 'planning';

    await stmStore.prune();

    const plan = await planCycle(
      cycleId, companyId, companyContext, company.plan,
      userDirective, contextBuilder, supabase, onEvent
    );

    cycle.plan = plan;
    await supabase
      .from('operating_cycles')
      .update({ plan: plan as unknown as Record<string, unknown> })
      .eq('id', cycleId);

    // --- EXECUTING ---
    await updateCycleStatus(cycleId, 'executing', supabase);
    cycle.status = 'executing';

    const deps: TaskRunnerDeps = {
      supabase,
      workingMemory,
      shortTermStore: stmStore,
      contextBuilder,
      messageBus,
      companyContext,
      companyPlan: company.plan,
      companyId,
    };

    const tasks = await executeCycle(cycleId, companyId, plan, deps, supabase, onEvent);

    // --- COMPLETING ---
    await updateCycleStatus(cycleId, 'completing', supabase);
    cycle.status = 'completing';

    await CostTracker.persistToDb(cycleId, supabase);

    // Condense memories for active agents
    const activeRoles = [...new Set(tasks.map((t) => t.agentRole))];
    for (const role of activeRoles) {
      const recentSTM = await stmStore.getRecentForAgent(companyId, role, 20);
      if (recentSTM.length >= 5) {
        await ltmStore.condenseFromShortTerm(companyId, role, recentSTM);
      }
    }

    // --- NOTIFYING ---
    await updateCycleStatus(cycleId, 'notifying', supabase);
    cycle.status = 'notifying';

    onEvent({
      type: 'cycle_status',
      cycleId,
      status: 'notifying',
      content: 'Cycle complete. Generating notifications...',
      timestamp: new Date().toISOString(),
    });

    // --- DONE ---
    const completedAt = new Date().toISOString();
    const totalCost = CostTracker.getCycleTotalCost(cycleId);

    await supabase
      .from('operating_cycles')
      .update({ status: 'done', completed_at: completedAt, total_cost_usd: totalCost })
      .eq('id', cycleId);

    cycle.status = 'done';
    cycle.completedAt = completedAt;
    cycle.totalCostUsd = totalCost;

    onEvent({
      type: 'cycle_done',
      cycleId,
      content: `Cycle completed. ${tasks.filter((t) => t.status === 'completed').length}/${tasks.length} tasks done. Cost: $${totalCost.toFixed(4)}`,
      timestamp: new Date().toISOString(),
    });

    return cycle;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await supabase
      .from('operating_cycles')
      .update({ status: 'failed', error: errorMessage, completed_at: new Date().toISOString() })
      .eq('id', cycleId);

    cycle.status = 'failed';
    cycle.error = errorMessage;

    onEvent({
      type: 'error',
      cycleId,
      content: `Cycle failed: ${errorMessage}`,
      timestamp: new Date().toISOString(),
    });

    return cycle;
  } finally {
    activeCycles.delete(companyId);
    CostTracker.cleanup(cycleId);
    workingMemory.clear();
  }
}

async function updateCycleStatus(cycleId: string, status: CycleStatus, supabase: SupabaseClient): Promise<void> {
  await supabase.from('operating_cycles').update({ status }).eq('id', cycleId);
}

export function isCompanyCycleActive(companyId: string): boolean {
  return activeCycles.has(companyId);
}

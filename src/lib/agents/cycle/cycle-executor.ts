import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentRole, CyclePlan, CycleTask, CycleStreamEvent } from '../../types';
import { AGENT_NAMES } from '../engine';
import { CostTracker } from '../cost-tracker';
import { runTask, type TaskRunnerDeps } from './task-runner';
import { v4 as uuid } from 'uuid';

const TASK_TIMEOUT_MS = 60_000;
const CYCLE_TIMEOUT_MS = 300_000; // 5 minutes

export async function executeCycle(
  cycleId: string,
  companyId: string,
  plan: CyclePlan,
  deps: TaskRunnerDeps,
  supabase: SupabaseClient,
  onEvent: (event: CycleStreamEvent) => void
): Promise<CycleTask[]> {
  // 1. Create CycleTask objects from plan
  const tasks: CycleTask[] = plan.tasks.map((t) => ({
    id: uuid(),
    cycleId,
    agentRole: t.agentRole,
    agentName: AGENT_NAMES[t.agentRole] || t.agentRole,
    description: t.description,
    status: 'pending' as const,
    result: null,
    dependsOn: [],
    tokensUsed: 0,
    costUsd: 0,
    startedAt: null,
    completedAt: null,
    error: null,
  }));

  // Resolve agentRole dependencies to task IDs
  const roleToTaskId = new Map<AgentRole, string>();
  for (const task of tasks) {
    roleToTaskId.set(task.agentRole, task.id);
  }
  for (let i = 0; i < plan.tasks.length; i++) {
    tasks[i].dependsOn = (plan.tasks[i].dependsOn || [])
      .map((depRole) => roleToTaskId.get(depRole))
      .filter((id): id is string => id !== undefined);
  }

  // 2. Insert tasks into DB
  await supabase.from('cycle_tasks').insert(
    tasks.map((t) => ({
      id: t.id,
      cycle_id: t.cycleId,
      company_id: companyId,
      agent_role: t.agentRole,
      agent_name: t.agentName,
      description: t.description,
      status: t.status,
      depends_on: t.dependsOn,
    }))
  );

  // 3. Dependency-aware parallel execution
  const completed = new Set<string>();
  const failed = new Set<string>();
  const cycleStart = Date.now();

  onEvent({
    type: 'cycle_status',
    cycleId,
    status: 'executing',
    content: `Executing ${tasks.length} tasks...`,
    timestamp: new Date().toISOString(),
  });

  while (completed.size + failed.size < tasks.length) {
    // Check cycle timeout
    if (Date.now() - cycleStart > CYCLE_TIMEOUT_MS) {
      for (const task of tasks) {
        if (task.status === 'pending' || task.status === 'running') {
          task.status = 'failed';
          task.error = 'Cycle timeout exceeded';
          failed.add(task.id);
        }
      }
      break;
    }

    // Check budget
    if (!CostTracker.checkBudget(cycleId)) {
      for (const task of tasks) {
        if (task.status === 'pending') {
          task.status = 'blocked';
          task.error = 'Budget exceeded';
          failed.add(task.id);
        }
      }
      break;
    }

    // Find ready tasks (all deps complete, not yet started)
    const ready = tasks.filter((t) => {
      if (t.status !== 'pending') return false;
      const anyDepFailed = t.dependsOn.some((depId) => failed.has(depId));
      if (anyDepFailed) {
        t.status = 'blocked';
        t.error = 'Dependency failed';
        failed.add(t.id);
        return false;
      }
      return t.dependsOn.every((depId) => completed.has(depId));
    });

    if (ready.length === 0) {
      const running = tasks.filter((t) => t.status === 'running' || t.status === 'needs_data');
      if (running.length === 0) break;
      await new Promise((r) => setTimeout(r, 100));
      continue;
    }

    // Run ready tasks in parallel
    const results = await Promise.allSettled(
      ready.map(async (task) => {
        task.status = 'running';
        task.startedAt = new Date().toISOString();

        supabase
          .from('cycle_tasks')
          .update({ status: 'running', started_at: task.startedAt })
          .eq('id', task.id)
          .then(() => {});

        const result = await Promise.race([
          runTask(task, deps, onEvent),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Task timeout')), TASK_TIMEOUT_MS)
          ),
        ]);

        return { task, result };
      })
    );

    // Process results
    for (const settledResult of results) {
      if (settledResult.status === 'fulfilled') {
        const { task, result } = settledResult.value;

        if (result.status === 'needs_data') {
          // Handle inter-agent requests
          for (const req of result.requests) {
            await deps.messageBus.sendRequest(
              task.agentRole,
              req.targetRole,
              `Data request from ${task.agentName}`,
              req.question
            );
          }

          // Queue requested agents as new tasks if not already present
          for (const req of result.requests) {
            const existingTask = tasks.find(
              (t) => t.agentRole === req.targetRole && t.status !== 'failed'
            );
            if (!existingTask) {
              const newTask: CycleTask = {
                id: uuid(),
                cycleId,
                agentRole: req.targetRole,
                agentName: AGENT_NAMES[req.targetRole] || req.targetRole,
                description: req.question,
                status: 'pending',
                result: null,
                dependsOn: [],
                tokensUsed: 0,
                costUsd: 0,
                startedAt: null,
                completedAt: null,
                error: null,
              };
              tasks.push(newTask);
              supabase.from('cycle_tasks').insert({
                id: newTask.id,
                cycle_id: cycleId,
                company_id: companyId,
                agent_role: newTask.agentRole,
                agent_name: newTask.agentName,
                description: newTask.description,
                status: 'pending',
                depends_on: [],
              }).then(() => {});
            }
          }

          task.status = 'needs_data';
          task.result = result.result;
          task.tokensUsed += result.tokensUsed;
          task.costUsd += result.costUsd;
        } else if (result.status === 'completed') {
          task.status = 'completed';
          task.result = result.result;
          task.completedAt = new Date().toISOString();
          task.tokensUsed = result.tokensUsed;
          task.costUsd = result.costUsd;
          completed.add(task.id);

          // Check if any needs_data tasks can re-run
          await handleRerunTasks(tasks, task, deps, onEvent, completed);

          supabase
            .from('cycle_tasks')
            .update({
              status: 'completed',
              result: task.result?.slice(0, 50000),
              completed_at: task.completedAt,
              tokens_used: task.tokensUsed,
              cost_usd: task.costUsd,
            })
            .eq('id', task.id)
            .then(() => {});
        } else {
          task.status = 'failed';
          task.error = result.result || 'Task failed';
          task.completedAt = new Date().toISOString();
          failed.add(task.id);

          supabase
            .from('cycle_tasks')
            .update({
              status: 'failed',
              error: task.error?.slice(0, 5000),
              completed_at: task.completedAt,
            })
            .eq('id', task.id)
            .then(() => {});
        }
      } else {
        // Promise rejected (timeout or unexpected error)
        const taskFromReady = ready.find(
          (t) => t.status === 'running' && !completed.has(t.id) && !failed.has(t.id)
        );
        if (taskFromReady) {
          taskFromReady.status = 'failed';
          taskFromReady.error = settledResult.reason?.message || 'Unexpected error';
          taskFromReady.completedAt = new Date().toISOString();
          failed.add(taskFromReady.id);

          supabase
            .from('cycle_tasks')
            .update({
              status: 'failed',
              error: taskFromReady.error?.slice(0, 5000),
              completed_at: taskFromReady.completedAt,
            })
            .eq('id', taskFromReady.id)
            .then(() => {});
        }
      }
    }
  }

  deps.messageBus.sweepExpiredRequests();
  return tasks;
}

async function handleRerunTasks(
  tasks: CycleTask[],
  completedTask: CycleTask,
  deps: TaskRunnerDeps,
  onEvent: (event: CycleStreamEvent) => void,
  completed: Set<string>
): Promise<void> {
  const needsDataTasks = tasks.filter((t) => t.status === 'needs_data');

  for (const waitingTask of needsDataTasks) {
    const pendingRequests = deps.workingMemory.get(
      waitingTask.agentRole,
      `pending_requests_${waitingTask.id}`
    ) as { targetRole: AgentRole; question: string }[] | undefined;

    if (!pendingRequests) continue;

    const fulfilled = pendingRequests.some((r) => r.targetRole === completedTask.agentRole);
    if (!fulfilled) continue;

    const allFulfilled = pendingRequests.every((r) =>
      tasks.some((t) => t.agentRole === r.targetRole && t.status === 'completed')
    );
    if (!allFulfilled) continue;

    // Re-run with injected responses
    const injectedResponses = new Map<string, string>();
    for (const req of pendingRequests) {
      const respTask = tasks.find((t) => t.agentRole === req.targetRole && t.status === 'completed');
      if (respTask?.result) {
        injectedResponses.set(req.question, respTask.result);
      }
    }

    waitingTask.status = 'running';
    const rerunResult = await runTask(waitingTask, deps, onEvent, injectedResponses, 1);

    if (rerunResult.status === 'completed') {
      waitingTask.status = 'completed';
      waitingTask.result = rerunResult.result;
      waitingTask.completedAt = new Date().toISOString();
      waitingTask.tokensUsed += rerunResult.tokensUsed;
      waitingTask.costUsd += rerunResult.costUsd;
      completed.add(waitingTask.id);
    } else {
      waitingTask.status = 'failed';
      waitingTask.error = 'Re-run failed to complete';
      waitingTask.completedAt = new Date().toISOString();
    }
  }
}

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentRole } from '../types';

export interface CreditBalance {
  balance: number;
  lifetimePurchased: number;
  lifetimeUsed: number;
  lifetimeBonus: number;
}

export interface CreditTransaction {
  id: string;
  type: 'purchase' | 'bonus' | 'task_usage' | 'refund' | 'trial';
  amount: number;
  balanceAfter: number;
  taskId?: string;
  agentRole?: string;
  description?: string;
  createdAt: string;
}

export interface AgentCreditCost {
  agentRole: string;
  baseCost: number;
  knowledgeMultiplier: number;
  executionMultiplier: number;
}

export interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  bonusCredits: number;
  priceCents: number;
  stripePriceId?: string;
}

export type TaskType = 'base' | 'knowledge' | 'execution';

const FREE_TRIAL_CREDITS = 25;

export class CreditManager {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get current credit balance for a company
   */
  async getBalance(companyId: string): Promise<CreditBalance | null> {
    const { data, error } = await this.supabase
      .from('credit_balances')
      .select('balance, lifetime_purchased, lifetime_used, lifetime_bonus')
      .eq('company_id', companyId)
      .single();

    if (error || !data) return null;

    return {
      balance: data.balance,
      lifetimePurchased: data.lifetime_purchased,
      lifetimeUsed: data.lifetime_used,
      lifetimeBonus: data.lifetime_bonus,
    };
  }

  /**
   * Initialize credit balance for new company with free trial credits
   */
  async initializeBalance(companyId: string): Promise<CreditBalance> {
    const { data, error } = await this.supabase
      .from('credit_balances')
      .insert({
        company_id: companyId,
        balance: FREE_TRIAL_CREDITS,
        lifetime_bonus: FREE_TRIAL_CREDITS,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to initialize credit balance: ${error.message}`);

    // Log the trial credits transaction
    await this.logTransaction(companyId, {
      type: 'trial',
      amount: FREE_TRIAL_CREDITS,
      balanceAfter: FREE_TRIAL_CREDITS,
      description: 'Free trial credits on signup',
    });

    return {
      balance: FREE_TRIAL_CREDITS,
      lifetimePurchased: 0,
      lifetimeUsed: 0,
      lifetimeBonus: FREE_TRIAL_CREDITS,
    };
  }

  /**
   * Check if company has enough credits for a task
   */
  async hasCredits(companyId: string, amount: number): Promise<boolean> {
    const balance = await this.getBalance(companyId);
    return balance !== null && balance.balance >= amount;
  }

  /**
   * Deduct credits for a task
   */
  async deductCredits(
    companyId: string,
    amount: number,
    options: {
      taskId?: string;
      agentRole?: AgentRole;
      description?: string;
    } = {}
  ): Promise<{ success: boolean; newBalance: number; error?: string }> {
    const balance = await this.getBalance(companyId);
    if (!balance || balance.balance < amount) {
      return { success: false, newBalance: balance?.balance ?? 0, error: 'Insufficient credits' };
    }

    const newBalance = balance.balance - amount;

    const { error } = await this.supabase
      .from('credit_balances')
      .update({
        balance: newBalance,
        lifetime_used: balance.lifetimeUsed + amount,
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', companyId);

    if (error) {
      return { success: false, newBalance: balance.balance, error: error.message };
    }

    await this.logTransaction(companyId, {
      type: 'task_usage',
      amount: -amount,
      balanceAfter: newBalance,
      taskId: options.taskId,
      agentRole: options.agentRole,
      description: options.description || `Task execution by ${options.agentRole || 'agent'}`,
    });

    return { success: true, newBalance };
  }

  /**
   * Add credits from purchase
   */
  async addPurchasedCredits(
    companyId: string,
    packageId: string,
    stripePaymentId?: string
  ): Promise<{ success: boolean; newBalance: number; error?: string }> {
    // Get package details
    const { data: pkg, error: pkgError } = await this.supabase
      .from('credit_packages')
      .select('credits, bonus_credits')
      .eq('id', packageId)
      .single();

    if (pkgError || !pkg) {
      return { success: false, newBalance: 0, error: 'Package not found' };
    }

    const totalCredits = pkg.credits + pkg.bonus_credits;
    const balance = await this.getBalance(companyId);
    const currentBalance = balance?.balance ?? 0;
    const newBalance = currentBalance + totalCredits;

    const { error } = await this.supabase
      .from('credit_balances')
      .upsert({
        company_id: companyId,
        balance: newBalance,
        lifetime_purchased: (balance?.lifetimePurchased ?? 0) + pkg.credits,
        lifetime_bonus: (balance?.lifetimeBonus ?? 0) + pkg.bonus_credits,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      return { success: false, newBalance: currentBalance, error: error.message };
    }

    // Log purchase transaction
    await this.logTransaction(companyId, {
      type: 'purchase',
      amount: pkg.credits,
      balanceAfter: newBalance,
      description: `Purchased ${packageId} package`,
      stripePaymentId,
    });

    // Log bonus if any
    if (pkg.bonus_credits > 0) {
      await this.logTransaction(companyId, {
        type: 'bonus',
        amount: pkg.bonus_credits,
        balanceAfter: newBalance,
        description: `Bonus credits with ${packageId} package`,
      });
    }

    return { success: true, newBalance };
  }

  /**
   * Get agent credit cost for a task type
   */
  async getTaskCost(agentRole: AgentRole, taskType: TaskType = 'base'): Promise<number> {
    const { data, error } = await this.supabase
      .from('agent_credit_costs')
      .select('base_cost, knowledge_multiplier, execution_multiplier')
      .eq('agent_role', agentRole)
      .single();

    if (error || !data) {
      // Default fallback
      return taskType === 'base' ? 10 : taskType === 'knowledge' ? 15 : 20;
    }

    switch (taskType) {
      case 'knowledge':
        return Math.ceil(data.base_cost * data.knowledge_multiplier);
      case 'execution':
        return Math.ceil(data.base_cost * data.execution_multiplier);
      default:
        return data.base_cost;
    }
  }

  /**
   * Get all available credit packages
   */
  async getPackages(): Promise<CreditPackage[]> {
    const { data, error } = await this.supabase
      .from('credit_packages')
      .select('*')
      .eq('is_active', true)
      .order('price_cents', { ascending: true });

    if (error || !data) return [];

    return data.map((p) => ({
      id: p.id,
      name: p.name,
      credits: p.credits,
      bonusCredits: p.bonus_credits,
      priceCents: p.price_cents,
      stripePriceId: p.stripe_price_id,
    }));
  }

  /**
   * Get recent transactions for a company
   */
  async getTransactions(companyId: string, limit = 50): Promise<CreditTransaction[]> {
    const { data, error } = await this.supabase
      .from('credit_transactions')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return data.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      balanceAfter: t.balance_after,
      taskId: t.task_id,
      agentRole: t.agent_role,
      description: t.description,
      createdAt: t.created_at,
    }));
  }

  /**
   * Estimate credits needed for a cycle plan
   */
  async estimateCycleCost(tasks: { agentRole: AgentRole; taskType?: TaskType }[]): Promise<number> {
    let total = 0;
    for (const task of tasks) {
      total += await this.getTaskCost(task.agentRole, task.taskType ?? 'base');
    }
    return total;
  }

  /**
   * Log a credit transaction
   */
  private async logTransaction(
    companyId: string,
    transaction: {
      type: CreditTransaction['type'];
      amount: number;
      balanceAfter: number;
      taskId?: string;
      agentRole?: string;
      description?: string;
      stripePaymentId?: string;
    }
  ): Promise<void> {
    await this.supabase.from('credit_transactions').insert({
      company_id: companyId,
      type: transaction.type,
      amount: transaction.amount,
      balance_after: transaction.balanceAfter,
      task_id: transaction.taskId,
      agent_role: transaction.agentRole,
      description: transaction.description,
      stripe_payment_id: transaction.stripePaymentId,
    });
  }

  /**
   * Refund credits for a failed task
   */
  async refundCredits(
    companyId: string,
    amount: number,
    taskId?: string,
    reason?: string
  ): Promise<{ success: boolean; newBalance: number }> {
    const balance = await this.getBalance(companyId);
    const currentBalance = balance?.balance ?? 0;
    const newBalance = currentBalance + amount;

    const { error } = await this.supabase
      .from('credit_balances')
      .update({
        balance: newBalance,
        lifetime_used: Math.max(0, (balance?.lifetimeUsed ?? 0) - amount),
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', companyId);

    if (error) {
      return { success: false, newBalance: currentBalance };
    }

    await this.logTransaction(companyId, {
      type: 'refund',
      amount,
      balanceAfter: newBalance,
      taskId,
      description: reason || 'Task refund',
    });

    return { success: true, newBalance };
  }

  /**
   * Reserve credits atomically for a team task using database RPC.
   * Prevents race conditions by locking the balance row during reservation.
   *
   * @param companyId - Company to charge
   * @param teamTaskId - The team task ID for tracking
   * @param agentRoles - Array of agent roles (2-4 agents)
   * @returns Result with success status, new balance, and reserved amount
   */
  async reserveCreditsForTeam(
    companyId: string,
    teamTaskId: string,
    agentRoles: AgentRole[]
  ): Promise<{ success: boolean; newBalance: number; reserved: number; error?: string }> {
    const { data, error } = await this.supabase.rpc('reserve_credits_for_team', {
      p_company_id: companyId,
      p_team_task_id: teamTaskId,
      p_agent_roles: agentRoles,
    });

    if (error) {
      return { success: false, newBalance: 0, reserved: 0, error: error.message };
    }

    return {
      success: data?.success ?? false,
      newBalance: data?.new_balance ?? 0,
      reserved: data?.reserved ?? 0,
      error: data?.error,
    };
  }

  /**
   * Refund credits for failed agents in a team task.
   * Called when partial failures occur (some agents succeed, some fail).
   *
   * @param companyId - Company to refund
   * @param teamTaskId - The team task ID
   * @param failedRoles - Array of agent roles that failed
   * @returns Result with refunded amount and new balance
   */
  async refundTeamCredits(
    companyId: string,
    teamTaskId: string,
    failedRoles: AgentRole[]
  ): Promise<{ success: boolean; refunded: number; newBalance: number; error?: string }> {
    const { data, error } = await this.supabase.rpc('refund_team_credits', {
      p_company_id: companyId,
      p_team_task_id: teamTaskId,
      p_failed_roles: failedRoles,
    });

    if (error) {
      return { success: false, refunded: 0, newBalance: 0, error: error.message };
    }

    return {
      success: data?.success ?? false,
      refunded: data?.refunded ?? 0,
      newBalance: data?.new_balance ?? 0,
      error: data?.error,
    };
  }

  /**
   * Estimate total credits needed for a team task.
   *
   * @param agentRoles - Array of agent roles in the team
   * @returns Total estimated credit cost
   */
  async estimateTeamCost(agentRoles: AgentRole[]): Promise<number> {
    let total = 0;
    for (const role of agentRoles) {
      total += await this.getTaskCost(role, 'base');
    }
    return total;
  }
}

// Export singleton factory
export function createCreditManager(supabase: SupabaseClient): CreditManager {
  return new CreditManager(supabase);
}

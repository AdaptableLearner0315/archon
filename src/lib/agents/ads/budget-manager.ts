/**
 * Budget Manager with Threshold-Based Approval
 * Auto-approves small changes, requires human approval for large changes
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendNudge } from '../notifications/nudge';
import { createGoogleAdsClient } from './platforms/google';
import { createMetaAdsClient } from './platforms/meta';
import { decryptCredentials } from './credentials';

const APPROVAL_THRESHOLD = 0.10; // 10%

export type AdPlatform = 'google' | 'meta' | 'tiktok' | 'linkedin';

export interface BudgetChangeRequest {
  platform: AdPlatform;
  campaignId: string;
  currentBudget: number;
  proposedBudget: number;
  reason: string;
}

export interface BudgetChangeResult {
  approved: boolean;
  requiresHuman: boolean;
  executed: boolean;
  message: string;
  changePercent: number;
}

const BUDGET_CHANGE_REGEX = /\[BUDGET_CHANGE:\s*({.+?})\]/g;

/**
 * Parse budget change markers from agent output
 */
export function parseBudgetChangeMarkers(text: string): BudgetChangeRequest[] {
  const requests: BudgetChangeRequest[] = [];
  const regex = new RegExp(BUDGET_CHANGE_REGEX.source, 'g');
  let match;

  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]) as {
        platform?: string;
        campaign_id?: string;
        current_budget?: number;
        proposed_budget?: number;
        reason?: string;
      };

      if (
        parsed.platform &&
        parsed.campaign_id &&
        typeof parsed.current_budget === 'number' &&
        typeof parsed.proposed_budget === 'number'
      ) {
        requests.push({
          platform: parsed.platform as AdPlatform,
          campaignId: parsed.campaign_id,
          currentBudget: parsed.current_budget,
          proposedBudget: parsed.proposed_budget,
          reason: parsed.reason || 'No reason provided',
        });
      }
    } catch (error) {
      console.error('Failed to parse budget change marker:', error);
    }
  }

  return requests;
}

/**
 * Process a budget change request
 * Auto-approves if change is <10%, otherwise blocks for human approval
 */
export async function processBudgetChange(
  request: BudgetChangeRequest,
  companyId: string,
  taskId: string,
  supabase: SupabaseClient
): Promise<BudgetChangeResult> {
  const { platform, campaignId, currentBudget, proposedBudget, reason } = request;

  // Calculate change percentage
  const changePercent = Math.abs(proposedBudget - currentBudget) / currentBudget;

  // Record the budget change attempt
  await supabase.from('budget_changes').insert({
    company_id: companyId,
    platform,
    campaign_id: campaignId,
    previous_budget: currentBudget,
    new_budget: proposedBudget,
    change_percent: changePercent,
    auto_approved: changePercent <= APPROVAL_THRESHOLD,
    reason,
  });

  // If change is within threshold, auto-approve and execute
  if (changePercent <= APPROVAL_THRESHOLD) {
    const executeResult = await executeBudgetChange(request, companyId, supabase);

    return {
      approved: executeResult.success,
      requiresHuman: false,
      executed: executeResult.success,
      message: executeResult.success
        ? `Auto-approved and executed: ${formatBudgetChange(currentBudget, proposedBudget)} (${(changePercent * 100).toFixed(1)}% change)`
        : `Auto-approved but execution failed: ${executeResult.message}`,
      changePercent,
    };
  }

  // Large change - require human approval
  const question = `Approve budget change for ${platform} campaign?

**Campaign ID**: ${campaignId}
**Current Budget**: $${currentBudget.toFixed(2)}/day
**Proposed Budget**: $${proposedBudget.toFixed(2)}/day
**Change**: ${changePercent > 0 ? '+' : ''}${(changePercent * 100).toFixed(1)}% (${proposedBudget > currentBudget ? 'increase' : 'decrease'})

**Reason**: ${reason}

Reply "yes" to approve or "no" to reject.`;

  // Mark task as blocked
  await supabase
    .from('cycle_tasks')
    .update({
      needs_human_input: true,
      human_input_question: question,
      status: 'needs_data',
    })
    .eq('id', taskId);

  // Send nudge notification
  await sendNudge(companyId, taskId, 'ads', question, supabase);

  return {
    approved: false,
    requiresHuman: true,
    executed: false,
    message: `Large budget change (${(changePercent * 100).toFixed(1)}%) requires human approval. Notification sent.`,
    changePercent,
  };
}

/**
 * Execute a budget change on the ad platform
 */
async function executeBudgetChange(
  request: BudgetChangeRequest,
  companyId: string,
  supabase: SupabaseClient
): Promise<{ success: boolean; message: string }> {
  const { platform, campaignId, proposedBudget } = request;

  // Get platform credentials
  const { data: credRow } = await supabase
    .from('ad_platform_credentials')
    .select('credentials_encrypted')
    .eq('company_id', companyId)
    .eq('platform', platform)
    .eq('is_active', true)
    .single();

  if (!credRow) {
    return { success: false, message: `No active credentials for ${platform}` };
  }

  try {
    const credentials = decryptCredentials(credRow.credentials_encrypted);

    switch (platform) {
      case 'google': {
        const client = createGoogleAdsClient(credentials as { refreshToken: string; customerId: string });
        // Google Ads uses micros (1 dollar = 1,000,000 micros)
        return await client.updateBudget(campaignId, proposedBudget * 1000000);
      }

      case 'meta': {
        const client = createMetaAdsClient(credentials as { accessToken: string; adAccountId: string });
        // Meta uses cents (1 dollar = 100 cents)
        return await client.updateDailyBudget(campaignId, proposedBudget * 100);
      }

      case 'tiktok':
      case 'linkedin':
        return { success: false, message: `${platform} integration not yet implemented` };

      default:
        return { success: false, message: `Unknown platform: ${platform}` };
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error executing budget change',
    };
  }
}

/**
 * Handle human response to budget change request
 */
export async function handleBudgetApprovalResponse(
  taskId: string,
  response: string,
  supabase: SupabaseClient
): Promise<{ executed: boolean; message: string }> {
  const approved = response.toLowerCase().includes('yes') || response.toLowerCase().includes('approve');

  // Get the task to find the original question
  const { data: task } = await supabase
    .from('cycle_tasks')
    .select('human_input_question, company_id')
    .eq('id', taskId)
    .single();

  if (!task) {
    return { executed: false, message: 'Task not found' };
  }

  if (!approved) {
    // Update the budget_changes record
    await supabase
      .from('budget_changes')
      .update({ approved_by: 'human_rejected' })
      .eq('company_id', task.company_id)
      .order('created_at', { ascending: false })
      .limit(1);

    return { executed: false, message: 'Budget change rejected by user' };
  }

  // Parse the original question to get budget change details
  const question = task.human_input_question || '';
  const platformMatch = question.match(/for (\w+) campaign/);
  const campaignMatch = question.match(/Campaign ID\*\*: (.+)/);
  const currentMatch = question.match(/Current Budget\*\*: \$([0-9.]+)/);
  const proposedMatch = question.match(/Proposed Budget\*\*: \$([0-9.]+)/);

  if (!platformMatch || !campaignMatch || !currentMatch || !proposedMatch) {
    return { executed: false, message: 'Could not parse original budget change request' };
  }

  const request: BudgetChangeRequest = {
    platform: platformMatch[1] as AdPlatform,
    campaignId: campaignMatch[1],
    currentBudget: parseFloat(currentMatch[1]),
    proposedBudget: parseFloat(proposedMatch[1]),
    reason: 'Human approved',
  };

  const result = await executeBudgetChange(request, task.company_id, supabase);

  // Update the budget_changes record
  await supabase
    .from('budget_changes')
    .update({ approved_by: 'human_approved' })
    .eq('company_id', task.company_id)
    .order('created_at', { ascending: false })
    .limit(1);

  return { executed: result.success, message: result.message };
}

/**
 * Get budget change history for a company
 */
export async function getBudgetHistory(
  companyId: string,
  supabase: SupabaseClient,
  options: { limit?: number; platform?: AdPlatform } = {}
): Promise<unknown[]> {
  const { limit = 50, platform } = options;

  let query = supabase
    .from('budget_changes')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (platform) {
    query = query.eq('platform', platform);
  }

  const { data } = await query;
  return data || [];
}

/**
 * Get current daily spend across all platforms
 */
export async function getTotalDailySpend(
  companyId: string,
  supabase: SupabaseClient
): Promise<{ platform: string; dailyBudget: number }[]> {
  const { data: credentials } = await supabase
    .from('ad_platform_credentials')
    .select('platform, credentials_encrypted')
    .eq('company_id', companyId)
    .eq('is_active', true);

  if (!credentials || credentials.length === 0) {
    return [];
  }

  const results: { platform: string; dailyBudget: number }[] = [];

  for (const cred of credentials) {
    try {
      const decrypted = decryptCredentials(cred.credentials_encrypted);

      if (cred.platform === 'google') {
        const client = createGoogleAdsClient(decrypted as { refreshToken: string; customerId: string });
        const campaigns = await client.getCampaigns();
        const totalBudget = campaigns
          .filter(c => c.status === 'ENABLED')
          .reduce((sum, c) => sum + c.dailyBudgetMicros / 1000000, 0);
        results.push({ platform: 'google', dailyBudget: totalBudget });
      }

      if (cred.platform === 'meta') {
        const client = createMetaAdsClient(decrypted as { accessToken: string; adAccountId: string });
        const campaigns = await client.getCampaigns();
        const totalBudget = campaigns
          .filter(c => c.status === 'ACTIVE')
          .reduce((sum, c) => sum + c.dailyBudget, 0);
        results.push({ platform: 'meta', dailyBudget: totalBudget });
      }
    } catch (error) {
      console.error(`Failed to get spend for ${cred.platform}:`, error);
    }
  }

  return results;
}

function formatBudgetChange(current: number, proposed: number): string {
  return `$${current.toFixed(2)} -> $${proposed.toFixed(2)}/day`;
}

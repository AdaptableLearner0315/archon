/**
 * Memory Decay Operation
 *
 * Implements automatic importance degradation based on half-life.
 * Memories that aren't accessed gradually lose importance, simulating human forgetting.
 *
 * Formula: effectiveImportance = baseImportance × 0.5^(daysSinceLastAccess / halfLifeDays)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyMemory, MemoryDomain } from '../../types';

interface DecayResult {
  processed: number;
  decayed: number;
  archived: number;
}

/**
 * Calculate the effective importance of a memory based on decay.
 */
export function calculateEffectiveImportance(memory: CompanyMemory): number {
  const now = Date.now();
  const lastAccessed = new Date(memory.lastAccessedAt).getTime();
  const daysSinceAccess = (now - lastAccessed) / (1000 * 60 * 60 * 24);

  // Apply exponential decay based on half-life
  const decayFactor = Math.pow(0.5, daysSinceAccess / memory.halfLifeDays);
  return memory.importance * decayFactor;
}

/**
 * Apply decay to all memories that haven't been accessed recently.
 * Archives memories that fall below the threshold.
 *
 * @param companyId - Company to process
 * @param options - Decay options
 * @returns Summary of decay processing
 */
export async function applyDecay(
  supabase: SupabaseClient,
  companyId: string,
  options: {
    minDaysSinceAccess?: number;
    archiveThreshold?: number;
    dryRun?: boolean;
  } = {}
): Promise<DecayResult> {
  const {
    minDaysSinceAccess = 7,
    archiveThreshold = 0.1,
    dryRun = false,
  } = options;

  const result: DecayResult = { processed: 0, decayed: 0, archived: 0 };

  // Find memories that haven't been accessed recently
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - minDaysSinceAccess);

  const { data: memories, error } = await supabase
    .from('company_memories')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_archived', false)
    .lt('last_accessed_at', cutoffDate.toISOString());

  if (error || !memories) {
    console.error('[Decay] Failed to fetch memories:', error);
    return result;
  }

  result.processed = memories.length;

  for (const row of memories) {
    const memory = mapRow(row);
    const effectiveImportance = calculateEffectiveImportance(memory);

    // Check if memory should be archived
    if (effectiveImportance < archiveThreshold) {
      result.archived++;

      if (!dryRun) {
        await supabase
          .from('company_memories')
          .update({
            is_archived: true,
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days to permanent deletion
            updated_at: new Date().toISOString(),
          })
          .eq('id', memory.id);
      }
    } else if (effectiveImportance < memory.importance * 0.9) {
      // Only update if significant decay (>10%)
      result.decayed++;

      if (!dryRun) {
        // We don't actually update the stored importance - we calculate it dynamically
        // But we can optionally log or track decay metrics
      }
    }
  }

  return result;
}

/**
 * Get memories with low effective importance (candidates for archival).
 */
export async function getDecayedMemories(
  supabase: SupabaseClient,
  companyId: string,
  options: {
    threshold?: number;
    domain?: MemoryDomain;
    limit?: number;
  } = {}
): Promise<{ memory: CompanyMemory; effectiveImportance: number }[]> {
  const { threshold = 0.2, domain, limit = 50 } = options;

  let query = supabase
    .from('company_memories')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_archived', false)
    .limit(limit * 2); // Get more to filter

  if (domain) {
    query = query.eq('domain', domain);
  }

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  const results: { memory: CompanyMemory; effectiveImportance: number }[] = [];

  for (const row of data) {
    const memory = mapRow(row);
    const effectiveImportance = calculateEffectiveImportance(memory);

    if (effectiveImportance < threshold) {
      results.push({ memory, effectiveImportance });
    }
  }

  // Sort by effective importance (lowest first)
  results.sort((a, b) => a.effectiveImportance - b.effectiveImportance);

  return results.slice(0, limit);
}

/**
 * Refresh a memory (reset its access time to prevent decay).
 */
export async function refreshMemory(
  supabase: SupabaseClient,
  memoryId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('company_memories')
    .update({
      last_accessed_at: new Date().toISOString(),
      times_accessed: supabase.rpc('increment', { x: 1 }) as unknown as number,
    })
    .eq('id', memoryId);

  return !error;
}

function mapRow(row: Record<string, unknown>): CompanyMemory {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    domain: row.domain as MemoryDomain,
    scope: row.scope as string,
    topic: row.topic as string,
    content: row.content as string,
    importance: row.importance as number,
    confidence: row.confidence as number,
    halfLifeDays: row.half_life_days as number,
    source: row.source as CompanyMemory['source'],
    sourceAgent: row.source_agent as string | null,
    sourceCycleId: row.source_cycle_id as string | null,
    supersedes: row.supersedes as string | null,
    supersededBy: row.superseded_by as string | null,
    timesAccessed: row.times_accessed as number,
    lastAccessedAt: row.last_accessed_at as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    expiresAt: row.expires_at as string | null,
    isArchived: row.is_archived as boolean,
  };
}

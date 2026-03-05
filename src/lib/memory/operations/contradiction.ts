/**
 * Contradiction Detection & Resolution
 *
 * Detects conflicting memories and provides resolution strategies.
 * Uses semantic similarity + Claude analysis to identify contradictions.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CompanyMemory,
  Contradiction,
  ContradictionType,
  ContradictionResolution,
  MemoryDomain,
} from '../../types';
import { ClaudeClient } from '../../agents/claude-client';
import { generateEmbedding, cosineSimilarity, isEmbeddingsAvailable } from '../embeddings';
import { createAssociation } from './associate';

interface DetectionOptions {
  similarityThreshold?: number;
  limit?: number;
  domain?: MemoryDomain;
}

/**
 * Detect potential contradictions for a specific memory.
 */
export async function detectContradictionsForMemory(
  supabase: SupabaseClient,
  memory: CompanyMemory,
  options: DetectionOptions = {}
): Promise<Contradiction[]> {
  const { similarityThreshold = 0.75, limit = 5 } = options;
  const contradictions: Contradiction[] = [];

  // Use pgvector function if embeddings available
  if (isEmbeddingsAvailable()) {
    const { data: candidates } = await supabase.rpc('find_potential_contradictions', {
      p_company_id: memory.companyId,
      p_memory_id: memory.id,
      p_similarity_threshold: similarityThreshold,
    });

    if (candidates && candidates.length > 0) {
      // Analyze each candidate for actual contradiction
      for (const candidate of candidates.slice(0, limit)) {
        const isContradiction = await analyzeContradiction(memory, {
          id: candidate.memory_id,
          topic: candidate.topic,
          content: candidate.content,
        });

        if (isContradiction) {
          // Get full memory for contradiction object
          const { data: fullMemory } = await supabase
            .from('company_memories')
            .select('*')
            .eq('id', candidate.memory_id)
            .single();

          if (fullMemory) {
            contradictions.push({
              id: crypto.randomUUID(),
              companyId: memory.companyId,
              memoryA: memory,
              memoryB: mapRow(fullMemory),
              conflictType: isContradiction.type,
              suggestedResolution: isContradiction.resolution,
              resolved: false,
              resolvedAt: null,
              resolvedBy: null,
              createdAt: new Date().toISOString(),
            });

            // Create a 'contradicts' association
            await createAssociation(supabase, {
              companyId: memory.companyId,
              memoryAId: memory.id,
              memoryBId: candidate.memory_id,
              relationshipType: 'contradicts',
              strength: candidate.similarity,
              createdBy: 'system',
            });
          }
        }
      }
    }
  }

  return contradictions;
}

/**
 * Scan all memories in a company for contradictions.
 */
export async function scanForContradictions(
  supabase: SupabaseClient,
  companyId: string,
  options: DetectionOptions = {}
): Promise<Contradiction[]> {
  const { domain, limit = 10 } = options;
  const contradictions: Contradiction[] = [];

  // Get high-importance memories to check
  let query = supabase
    .from('company_memories')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_archived', false)
    .gte('importance', 0.5)
    .order('importance', { ascending: false })
    .limit(50);

  if (domain) {
    query = query.eq('domain', domain);
  }

  const { data: memories } = await query;

  if (!memories || memories.length === 0) {
    return [];
  }

  // Check each memory for contradictions
  for (const row of memories) {
    if (contradictions.length >= limit) break;

    const memory = mapRow(row);
    const found = await detectContradictionsForMemory(supabase, memory, {
      ...options,
      limit: 2, // Limit per memory
    });

    contradictions.push(...found);
  }

  return contradictions.slice(0, limit);
}

/**
 * Analyze two memories to determine if they contradict.
 */
async function analyzeContradiction(
  memoryA: CompanyMemory | { id: string; topic: string; content: string },
  memoryB: { id: string; topic: string; content: string }
): Promise<{ type: ContradictionType; resolution: ContradictionResolution } | null> {
  try {
    const result = await ClaudeClient.call({
      useCase: 'memory_consolidation',
      system: `You are a contradiction detection system. Analyze two pieces of information and determine if they contradict each other.

A contradiction exists when:
- Factual: Two statements make incompatible claims about the same thing
- Temporal: One statement is outdated and replaced by newer information
- Strategic: Two strategies or approaches are incompatible

If they contradict, also suggest a resolution:
- keep_newer: The more recent information should be kept
- keep_more_important: The higher importance memory should be kept
- merge: The information can be reconciled by merging
- ask_user: Human judgment needed

Respond ONLY with JSON:
{
  "isContradiction": boolean,
  "type": "factual" | "temporal" | "strategic" | null,
  "resolution": "keep_newer" | "keep_more_important" | "merge" | "ask_user" | null,
  "explanation": "brief explanation"
}`,
      messages: [
        {
          role: 'user',
          content: `Memory A:
Topic: ${'topic' in memoryA ? memoryA.topic : ''}
Content: ${'content' in memoryA ? memoryA.content : ''}

Memory B:
Topic: ${memoryB.topic}
Content: ${memoryB.content}`,
        },
      ],
    });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    if (parsed.isContradiction && parsed.type && parsed.resolution) {
      return {
        type: parsed.type as ContradictionType,
        resolution: parsed.resolution as ContradictionResolution,
      };
    }

    return null;
  } catch (error) {
    console.error('[Contradiction] Analysis failed:', error);
    return null;
  }
}

/**
 * Resolve a contradiction by applying the suggested resolution.
 */
export async function resolveContradiction(
  supabase: SupabaseClient,
  contradiction: Contradiction,
  options: {
    resolution?: ContradictionResolution;
    resolvedBy?: 'system' | 'user';
  } = {}
): Promise<boolean> {
  const { resolution = contradiction.suggestedResolution, resolvedBy = 'system' } = options;

  switch (resolution) {
    case 'keep_newer': {
      // Archive the older memory
      const older =
        new Date(contradiction.memoryA.createdAt) < new Date(contradiction.memoryB.createdAt)
          ? contradiction.memoryA
          : contradiction.memoryB;
      const newer = older === contradiction.memoryA ? contradiction.memoryB : contradiction.memoryA;

      await supabase
        .from('company_memories')
        .update({
          is_archived: true,
          superseded_by: newer.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', older.id);

      await supabase
        .from('company_memories')
        .update({
          supersedes: older.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', newer.id);
      break;
    }

    case 'keep_more_important': {
      // Archive the less important memory
      const lessImportant =
        contradiction.memoryA.importance < contradiction.memoryB.importance
          ? contradiction.memoryA
          : contradiction.memoryB;
      const moreImportant =
        lessImportant === contradiction.memoryA ? contradiction.memoryB : contradiction.memoryA;

      await supabase
        .from('company_memories')
        .update({
          is_archived: true,
          superseded_by: moreImportant.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', lessImportant.id);
      break;
    }

    case 'merge': {
      // Merge content into the more important memory and archive the other
      const primary =
        contradiction.memoryA.importance >= contradiction.memoryB.importance
          ? contradiction.memoryA
          : contradiction.memoryB;
      const secondary = primary === contradiction.memoryA ? contradiction.memoryB : contradiction.memoryA;

      const mergedContent = `${primary.content}\n\n[Merged from conflicting memory]: ${secondary.content}`;

      await supabase
        .from('company_memories')
        .update({
          content: mergedContent.slice(0, 10000),
          confidence: Math.max(primary.confidence, secondary.confidence),
          updated_at: new Date().toISOString(),
        })
        .eq('id', primary.id);

      await supabase
        .from('company_memories')
        .update({
          is_archived: true,
          superseded_by: primary.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', secondary.id);
      break;
    }

    case 'ask_user':
      // Don't auto-resolve, just mark as detected
      return true;

    default:
      return false;
  }

  // Remove the contradicts association
  await supabase
    .from('memory_associations')
    .delete()
    .eq('memory_a_id', contradiction.memoryA.id)
    .eq('memory_b_id', contradiction.memoryB.id)
    .eq('relationship_type', 'contradicts');

  return true;
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

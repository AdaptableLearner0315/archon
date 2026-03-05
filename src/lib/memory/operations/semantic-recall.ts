/**
 * Semantic Recall Operation
 *
 * Enhanced memory recall using pgvector similarity search combined with
 * traditional scoring (importance, confidence, recency, frequency).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CompanyMemory,
  MemoryDomain,
  SemanticRecallOptions,
  MemoryRecallResult,
} from '../../types';
import { generateEmbedding, isEmbeddingsAvailable } from '../embeddings';

interface SemanticSearchResult {
  id: string;
  domain: string;
  scope: string;
  topic: string;
  content: string;
  importance: number;
  confidence: number;
  similarity: number;
}

/**
 * Recall memories using semantic search combined with traditional scoring.
 *
 * Enhanced scoring formula:
 * score = (semantic × w_sem) + (importance × w_imp) + (confidence × w_conf) +
 *         (recency × w_rec) + (frequency × w_freq)
 */
export async function semanticRecall(
  supabase: SupabaseClient,
  options: SemanticRecallOptions
): Promise<MemoryRecallResult[]> {
  const {
    companyId,
    query,
    domain,
    scope,
    limit = 20,
    minImportance = 0,
    minConfidence = 0,
    includeArchived = false,
    semanticThreshold = 0.5,
    useSemanticSearch = true,
    // Default weights - can be customized per-company
    weightImportance = 0.25,
    weightConfidence = 0.15,
    weightRecency = 0.15,
    weightFrequency = 0.10,
  } = options;

  // Calculate semantic weight (remainder after other weights)
  const weightSemantic = useSemanticSearch ? 0.35 : 0;
  const totalNonSemantic = weightImportance + weightConfidence + weightRecency + weightFrequency;

  // Normalize weights if semantic search is disabled
  const normalizer = useSemanticSearch ? 1 : 1 / totalNonSemantic;

  const wImp = weightImportance * normalizer;
  const wConf = weightConfidence * normalizer;
  const wRec = weightRecency * normalizer;
  const wFreq = weightFrequency * normalizer;
  const wSem = weightSemantic;

  // Generate query embedding if semantic search is enabled
  let queryEmbedding: number[] | null = null;

  if (useSemanticSearch && query && isEmbeddingsAvailable()) {
    queryEmbedding = options.queryEmbedding ?? (await generateEmbedding(query));
  }

  // If we have an embedding, use pgvector search
  if (queryEmbedding) {
    return semanticSearchWithPgvector(supabase, {
      companyId,
      queryEmbedding,
      domain,
      scope,
      limit,
      minImportance,
      minConfidence,
      includeArchived,
      semanticThreshold,
      weights: { wSem, wImp, wConf, wRec, wFreq },
    });
  }

  // Fallback to traditional text-based search
  return textBasedSearch(supabase, {
    companyId,
    query,
    domain,
    scope,
    limit,
    minImportance,
    minConfidence,
    includeArchived,
    weights: { wImp, wConf, wRec, wFreq },
  });
}

async function semanticSearchWithPgvector(
  supabase: SupabaseClient,
  options: {
    companyId: string;
    queryEmbedding: number[];
    domain?: MemoryDomain;
    scope?: string;
    limit: number;
    minImportance: number;
    minConfidence: number;
    includeArchived: boolean;
    semanticThreshold: number;
    weights: { wSem: number; wImp: number; wConf: number; wRec: number; wFreq: number };
  }
): Promise<MemoryRecallResult[]> {
  const {
    companyId,
    queryEmbedding,
    domain,
    scope,
    limit,
    minImportance,
    minConfidence,
    includeArchived,
    semanticThreshold,
    weights,
  } = options;

  // Use the pgvector function to find similar memories
  const { data: semanticResults, error } = await supabase.rpc('search_memories_by_embedding', {
    p_company_id: companyId,
    p_embedding: queryEmbedding,
    p_match_threshold: semanticThreshold,
    p_match_count: limit * 3, // Get more for re-ranking
  }) as { data: SemanticSearchResult[] | null; error: unknown };

  if (error || !semanticResults || semanticResults.length === 0) {
    console.warn('[SemanticRecall] Pgvector search failed or no results:', error);
    // Fallback to text search
    return textBasedSearch(supabase, {
      companyId,
      domain,
      scope,
      limit,
      minImportance,
      minConfidence,
      includeArchived,
      weights: {
        wImp: weights.wImp / (1 - weights.wSem),
        wConf: weights.wConf / (1 - weights.wSem),
        wRec: weights.wRec / (1 - weights.wSem),
        wFreq: weights.wFreq / (1 - weights.wSem),
      },
    });
  }

  // Get full memory records for scoring
  const memoryIds = semanticResults.map((r) => r.id);
  const { data: fullMemories } = await supabase
    .from('company_memories')
    .select('*')
    .in('id', memoryIds)
    .gte('importance', minImportance)
    .gte('confidence', minConfidence);

  if (!fullMemories || fullMemories.length === 0) {
    return [];
  }

  // Create a map of semantic similarities
  const similarityMap = new Map(semanticResults.map((r) => [r.id, r.similarity]));

  // Score and filter
  const now = Date.now();
  const scored: MemoryRecallResult[] = fullMemories
    .filter((row) => {
      if (!includeArchived && row.is_archived) return false;
      if (domain && row.domain !== domain) return false;
      if (scope && !row.scope.startsWith(scope)) return false;
      return true;
    })
    .map((row) => {
      const memory = mapRow(row);
      const similarity = similarityMap.get(memory.id) ?? 0;
      const score = calculateCompositeScore(memory, similarity, now, weights);
      return { memory, score };
    });

  // Sort and limit
  scored.sort((a, b) => b.score - a.score);
  const results = scored.slice(0, limit);

  // Touch accessed memories (fire and forget)
  touchMemories(
    supabase,
    results.map((r) => r.memory.id)
  );

  return results;
}

async function textBasedSearch(
  supabase: SupabaseClient,
  options: {
    companyId: string;
    query?: string;
    domain?: MemoryDomain;
    scope?: string;
    limit: number;
    minImportance: number;
    minConfidence: number;
    includeArchived: boolean;
    weights: { wImp: number; wConf: number; wRec: number; wFreq: number };
  }
): Promise<MemoryRecallResult[]> {
  const { companyId, query, domain, scope, limit, minImportance, minConfidence, includeArchived, weights } =
    options;

  let dbQuery = supabase
    .from('company_memories')
    .select('*')
    .eq('company_id', companyId)
    .gte('importance', minImportance)
    .gte('confidence', minConfidence);

  if (!includeArchived) {
    dbQuery = dbQuery.eq('is_archived', false);
  }

  if (domain) {
    dbQuery = dbQuery.eq('domain', domain);
  }

  if (scope) {
    dbQuery = dbQuery.like('scope', `${scope}%`);
  }

  if (query) {
    dbQuery = dbQuery.or(`topic.ilike.%${query}%,content.ilike.%${query}%`);
  }

  dbQuery = dbQuery.limit(limit * 3);

  const { data, error } = await dbQuery;

  if (error || !data || data.length === 0) {
    return [];
  }

  // Score and rank
  const now = Date.now();
  const scored: MemoryRecallResult[] = data.map((row) => {
    const memory = mapRow(row);
    // No semantic score, so we normalize the other weights
    const score = calculateCompositeScore(memory, 0, now, { ...weights, wSem: 0 });
    return { memory, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const results = scored.slice(0, limit);

  touchMemories(
    supabase,
    results.map((r) => r.memory.id)
  );

  return results;
}

function calculateCompositeScore(
  memory: CompanyMemory,
  semanticSimilarity: number,
  nowMs: number,
  weights: { wSem: number; wImp: number; wConf: number; wRec: number; wFreq: number }
): number {
  // Age in days
  const ageMs = nowMs - new Date(memory.lastAccessedAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  // Recency score with exponential decay
  const recencyScore = Math.pow(0.5, ageDays / memory.halfLifeDays);

  // Frequency score (logarithmic, capped)
  const frequencyScore = Math.min(1, Math.log(1 + memory.timesAccessed) / Math.log(100));

  // Composite score
  return (
    semanticSimilarity * weights.wSem +
    memory.importance * weights.wImp +
    memory.confidence * weights.wConf +
    recencyScore * weights.wRec +
    frequencyScore * weights.wFreq
  );
}

function touchMemories(supabase: SupabaseClient, ids: string[]): void {
  if (ids.length === 0) return;

  // Fire and forget - update access counts
  for (const id of ids) {
    supabase
      .from('company_memories')
      .select('times_accessed')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (data) {
          supabase
            .from('company_memories')
            .update({
              times_accessed: (data.times_accessed || 0) + 1,
              last_accessed_at: new Date().toISOString(),
            })
            .eq('id', id)
            .then(() => {});
        }
      });
  }
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
    embedding: row.embedding as number[] | undefined,
    reinforcementCount: row.reinforcement_count as number | undefined,
  };
}

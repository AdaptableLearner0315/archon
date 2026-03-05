/**
 * Attention Mechanism for Memory Context
 *
 * Smart context pruning that selects the most relevant memories for a given
 * task and agent. Instead of dumping all memories, it focuses on what matters.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CompanyMemory,
  AgentRole,
  MemoryDomain,
  AttentionContext,
} from '../../types';
import { generateEmbedding, isEmbeddingsAvailable } from '../embeddings';
import { semanticRecall } from './semantic-recall';

// Domain affinities by agent role (which domains are most relevant)
const AGENT_DOMAIN_AFFINITIES: Record<AgentRole, Partial<Record<MemoryDomain, number>>> = {
  ceo: { business_context: 1.3, competitors: 1.2, market: 1.2, agents: 1.1 },
  engineer: { business_context: 1.0, agents: 1.2 },
  growth: { market: 1.4, competitors: 1.3, business_context: 1.1 },
  marketing: { market: 1.4, business_context: 1.2, competitors: 1.2 },
  product: { business_context: 1.3, market: 1.2, competitors: 1.1 },
  operations: { business_context: 1.2, agents: 1.3 },
  sales: { competitors: 1.4, market: 1.3, business_context: 1.1 },
  support: { business_context: 1.2, agents: 1.1 },
  'data-analyst': { market: 1.3, business_context: 1.2, competitors: 1.2 },
  'customer-success': { business_context: 1.2, market: 1.1 },
  seo: { market: 1.3, business_context: 1.1, competitors: 1.2 },
  ads: { market: 1.4, competitors: 1.3, business_context: 1.1 },
};

const CHARS_PER_TOKEN = 4;
const DEFAULT_TOKEN_BUDGET = 1500;

/**
 * Select memories most relevant to the current attention context.
 * Returns a focused set of memories that fit within the token budget.
 */
export async function attendToMemories(
  supabase: SupabaseClient,
  companyId: string,
  context: AttentionContext
): Promise<CompanyMemory[]> {
  const { task, agentRole, recentActivities, tokenBudget = DEFAULT_TOKEN_BUDGET } = context;
  const charBudget = tokenBudget * CHARS_PER_TOKEN;

  // Build a query combining task + recent activities
  const queryText = buildQueryText(task, recentActivities);

  // Get domain affinities for this agent
  const affinities = AGENT_DOMAIN_AFFINITIES[agentRole] || {};

  // Recall memories with semantic search
  const recallOptions = {
    companyId,
    query: queryText,
    limit: 40, // Get more to filter
    useSemanticSearch: isEmbeddingsAvailable(),
  };

  const results = await semanticRecall(supabase, recallOptions);

  if (results.length === 0) {
    return [];
  }

  // Apply domain affinities to re-rank
  const ranked = results.map(({ memory, score }) => {
    const domainBoost = affinities[memory.domain] ?? 1.0;
    const adjustedScore = score * domainBoost;
    return { memory, adjustedScore };
  });

  ranked.sort((a, b) => b.adjustedScore - a.adjustedScore);

  // Select memories within token budget
  const selected: CompanyMemory[] = [];
  let charCount = 0;

  for (const { memory } of ranked) {
    const memoryChars = memory.topic.length + memory.content.length + 50; // overhead

    if (charCount + memoryChars > charBudget) {
      break;
    }

    selected.push(memory);
    charCount += memoryChars;
  }

  return selected;
}

/**
 * Get attention-weighted memories for multiple agents at once.
 * Useful for team tasks where each agent needs different context.
 */
export async function attendForTeam(
  supabase: SupabaseClient,
  companyId: string,
  agents: AgentRole[],
  task: string,
  options: { tokenBudgetPerAgent?: number } = {}
): Promise<Map<AgentRole, CompanyMemory[]>> {
  const { tokenBudgetPerAgent = 1000 } = options;
  const results = new Map<AgentRole, CompanyMemory[]>();

  // Run attention for each agent in parallel
  const promises = agents.map(async (agentRole) => {
    const memories = await attendToMemories(supabase, companyId, {
      task,
      agentRole,
      recentActivities: [],
      tokenBudget: tokenBudgetPerAgent,
    });
    return { agentRole, memories };
  });

  const resolved = await Promise.all(promises);

  for (const { agentRole, memories } of resolved) {
    results.set(agentRole, memories);
  }

  return results;
}

/**
 * Calculate attention scores for a set of memories given a context.
 * Returns memories sorted by attention score.
 */
export async function calculateAttentionScores(
  supabase: SupabaseClient,
  companyId: string,
  memories: CompanyMemory[],
  context: AttentionContext
): Promise<{ memory: CompanyMemory; attentionScore: number }[]> {
  if (memories.length === 0) return [];

  const { task, agentRole, recentActivities } = context;
  const queryText = buildQueryText(task, recentActivities);
  const affinities = AGENT_DOMAIN_AFFINITIES[agentRole] || {};

  let queryEmbedding: number[] | null = null;

  if (isEmbeddingsAvailable()) {
    queryEmbedding = await generateEmbedding(queryText);
  }

  const scored = await Promise.all(
    memories.map(async (memory) => {
      let semanticScore = 0;

      // Calculate semantic similarity if embeddings available
      if (queryEmbedding && memory.embedding) {
        const similarity = calculateCosineSimilarity(queryEmbedding, memory.embedding);
        semanticScore = similarity;
      } else {
        // Fallback: simple keyword matching
        semanticScore = calculateKeywordMatch(queryText, memory);
      }

      // Apply domain affinity
      const domainBoost = affinities[memory.domain] ?? 1.0;

      // Calculate base score from importance and confidence
      const baseScore = memory.importance * 0.5 + memory.confidence * 0.3;

      // Combine scores
      const attentionScore = (semanticScore * 0.5 + baseScore * 0.5) * domainBoost;

      return { memory, attentionScore };
    })
  );

  scored.sort((a, b) => b.attentionScore - a.attentionScore);
  return scored;
}

/**
 * Build a query text from task and recent activities.
 */
function buildQueryText(task: string, recentActivities: string[]): string {
  const parts = [task];

  if (recentActivities.length > 0) {
    parts.push('Recent context: ' + recentActivities.slice(0, 3).join('; '));
  }

  return parts.join('\n');
}

/**
 * Simple keyword matching fallback when embeddings unavailable.
 */
function calculateKeywordMatch(query: string, memory: CompanyMemory): number {
  const queryWords = new Set(
    query
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3)
  );

  const memoryText = `${memory.topic} ${memory.content}`.toLowerCase();
  const memoryWords = memoryText.split(/\W+/).filter((w) => w.length > 3);

  let matches = 0;
  for (const word of memoryWords) {
    if (queryWords.has(word)) {
      matches++;
    }
  }

  return Math.min(1, matches / Math.max(1, queryWords.size));
}

/**
 * Calculate cosine similarity between two vectors.
 */
function calculateCosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

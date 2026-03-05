/**
 * Cognitive Memory Store
 *
 * This is the backbone of Archon's memory system - treating memory as cognition,
 * not just storage. Implements 5 cognitive operations: encode, recall, extract,
 * consolidate, and forget.
 *
 * Unlike agent_memory_long_term (per-agent), company_memories are shared across
 * all agents and organized by domain (business_context, competitors, market, agents).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CompanyMemory,
  CompanyMemoryInput,
  MemoryDomain,
  MemoryRecallOptions,
  MemoryRecallResult,
  SemanticRecallOptions,
} from '../types';
import { ClaudeClient } from '../agents/claude-client';
import { generateCombinedEmbedding, generateEmbeddingsBatch, isEmbeddingsAvailable } from './embeddings';
import { semanticRecall } from './operations/semantic-recall';

const MAX_MEMORIES_PER_DOMAIN = 200;
const DEFAULT_HALF_LIFE_DAYS = 30;

export class CognitiveMemoryStore {
  constructor(private supabase: SupabaseClient) {}

  // ===========================================================================
  // ENCODE: Store a new memory with deduplication and contradiction resolution
  // ===========================================================================

  async encode(input: CompanyMemoryInput): Promise<CompanyMemory | null> {
    // Check for existing memory with same scope+topic
    const existing = await this.findExisting(input.companyId, input.scope, input.topic);

    if (existing) {
      // Update existing memory instead of creating duplicate
      return this.updateExisting(existing, input);
    }

    // Enforce per-domain cap
    await this.evictIfNeeded(input.companyId, input.domain);

    // Insert new memory
    const { data, error } = await this.supabase
      .from('company_memories')
      .insert({
        company_id: input.companyId,
        domain: input.domain,
        scope: input.scope,
        topic: input.topic,
        content: input.content,
        importance: input.importance ?? 0.5,
        confidence: input.confidence ?? 0.8,
        half_life_days: input.halfLifeDays ?? DEFAULT_HALF_LIFE_DAYS,
        source: input.source ?? 'onboarding',
        source_agent: input.sourceAgent ?? null,
        source_cycle_id: input.sourceCycleId ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error('[CognitiveMemory] Failed to encode memory:', error);
      return null;
    }

    const memory = this.mapRow(data);

    // Generate embedding asynchronously (don't block the response)
    this.generateAndStoreEmbedding(memory.id, input.topic, input.content);

    return memory;
  }

  /**
   * Generate embedding for a memory and store it.
   * Called asynchronously after memory creation.
   */
  private async generateAndStoreEmbedding(
    memoryId: string,
    topic: string,
    content: string
  ): Promise<void> {
    if (!isEmbeddingsAvailable()) return;

    try {
      const embedding = await generateCombinedEmbedding([topic, content]);

      if (embedding) {
        await this.supabase
          .from('company_memories')
          .update({ embedding })
          .eq('id', memoryId);
      }
    } catch (error) {
      console.error('[CognitiveMemory] Failed to generate embedding:', error);
    }
  }

  /**
   * Encode multiple memories in batch (efficient for seeding from onboarding)
   */
  async encodeBatch(inputs: CompanyMemoryInput[]): Promise<CompanyMemory[]> {
    if (inputs.length === 0) return [];

    const rows = inputs.map((input) => ({
      company_id: input.companyId,
      domain: input.domain,
      scope: input.scope,
      topic: input.topic,
      content: input.content,
      importance: input.importance ?? 0.5,
      confidence: input.confidence ?? 0.8,
      half_life_days: input.halfLifeDays ?? DEFAULT_HALF_LIFE_DAYS,
      source: input.source ?? 'onboarding',
      source_agent: input.sourceAgent ?? null,
      source_cycle_id: input.sourceCycleId ?? null,
    }));

    const { data, error } = await this.supabase
      .from('company_memories')
      .insert(rows)
      .select();

    if (error) {
      console.error('[CognitiveMemory] Failed to encode batch:', error);
      return [];
    }

    const memories = (data || []).map(this.mapRow);

    // Generate embeddings asynchronously in batch (don't block)
    this.generateBatchEmbeddings(memories, inputs);

    return memories;
  }

  /**
   * Generate embeddings for a batch of memories asynchronously.
   */
  private async generateBatchEmbeddings(
    memories: CompanyMemory[],
    inputs: CompanyMemoryInput[]
  ): Promise<void> {
    if (!isEmbeddingsAvailable() || memories.length === 0) return;

    try {
      // Create combined texts for embedding
      const texts = inputs.map((input) => `${input.topic}\n\n${input.content}`);
      const embeddings = await generateEmbeddingsBatch(texts);

      // Update each memory with its embedding
      for (let i = 0; i < memories.length; i++) {
        const embedding = embeddings[i];
        if (embedding) {
          this.supabase
            .from('company_memories')
            .update({ embedding })
            .eq('id', memories[i].id)
            .then(() => {});
        }
      }
    } catch (error) {
      console.error('[CognitiveMemory] Failed to generate batch embeddings:', error);
    }
  }

  // ===========================================================================
  // RECALL: Retrieve memories with composite scoring
  // ===========================================================================

  /**
   * Recall memories using semantic search when available, with fallback to text search.
   */
  async recallSemantic(options: SemanticRecallOptions): Promise<MemoryRecallResult[]> {
    return semanticRecall(this.supabase, options);
  }

  /**
   * Log memory usage for reflection analytics.
   * Call this when memories are actually used in agent tasks.
   */
  async logMemoryUsage(
    memoryId: string,
    companyId: string,
    context: {
      usedByAgent: string;
      cycleId?: string;
      taskContext?: string;
      wasHelpful?: boolean;
      relevanceScore?: number;
    }
  ): Promise<void> {
    const { usedByAgent, cycleId, taskContext, wasHelpful, relevanceScore } = context;

    await this.supabase.from('memory_usage_logs').insert({
      memory_id: memoryId,
      company_id: companyId,
      cycle_id: cycleId ?? null,
      used_by_agent: usedByAgent,
      task_context: taskContext ?? null,
      was_helpful: wasHelpful ?? null,
      relevance_score: relevanceScore ?? null,
    });
  }

  /**
   * Log usage for multiple memories at once.
   */
  async logBatchMemoryUsage(
    memoryIds: string[],
    companyId: string,
    context: {
      usedByAgent: string;
      cycleId?: string;
      taskContext?: string;
    }
  ): Promise<void> {
    if (memoryIds.length === 0) return;

    const rows = memoryIds.map((memoryId) => ({
      memory_id: memoryId,
      company_id: companyId,
      cycle_id: context.cycleId ?? null,
      used_by_agent: context.usedByAgent,
      task_context: context.taskContext ?? null,
      was_helpful: null,
      relevance_score: null,
    }));

    await this.supabase.from('memory_usage_logs').insert(rows);
  }

  async recall(options: MemoryRecallOptions): Promise<MemoryRecallResult[]> {
    // If embeddings are available and there's a query, use semantic search
    if (isEmbeddingsAvailable() && options.query) {
      return this.recallSemantic({
        ...options,
        useSemanticSearch: true,
      });
    }

    const {
      companyId,
      domain,
      scope,
      query,
      limit = 20,
      minImportance = 0,
      minConfidence = 0,
      includeArchived = false,
      weightImportance = 0.3,
      weightConfidence = 0.2,
      weightRecency = 0.3,
      weightFrequency = 0.2,
    } = options;

    // Build query
    let dbQuery = this.supabase
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
      // Prefix match for hierarchical scope
      dbQuery = dbQuery.like('scope', `${scope}%`);
    }

    if (query) {
      // Search in topic or content
      dbQuery = dbQuery.or(`topic.ilike.%${query}%,content.ilike.%${query}%`);
    }

    // Fetch more than limit to allow scoring and re-ranking
    dbQuery = dbQuery.limit(limit * 3);

    const { data, error } = await dbQuery;

    if (error) {
      console.error('[CognitiveMemory] Failed to recall:', error);
      return [];
    }

    if (!data || data.length === 0) return [];

    // Score and rank results
    const now = Date.now();
    const scored: MemoryRecallResult[] = data.map((row) => {
      const memory = this.mapRow(row);
      const score = this.calculateRecallScore(
        memory,
        now,
        weightImportance,
        weightConfidence,
        weightRecency,
        weightFrequency
      );
      return { memory, score };
    });

    // Sort by score descending and take top N
    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, limit);

    // Mark memories as accessed (fire and forget)
    this.touchMemories(results.map((r) => r.memory.id));

    return results;
  }

  /**
   * Get all memories for a domain (for dashboard display)
   */
  async getByDomain(
    companyId: string,
    domain: MemoryDomain,
    options: { includeArchived?: boolean; limit?: number } = {}
  ): Promise<CompanyMemory[]> {
    let query = this.supabase
      .from('company_memories')
      .select('*')
      .eq('company_id', companyId)
      .eq('domain', domain)
      .order('importance', { ascending: false })
      .order('last_accessed_at', { ascending: false })
      .limit(options.limit ?? 100);

    if (!options.includeArchived) {
      query = query.eq('is_archived', false);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[CognitiveMemory] Failed to get by domain:', error);
      return [];
    }

    return (data || []).map(this.mapRow);
  }

  /**
   * Get memory statistics for a company (for dashboard)
   */
  async getStats(companyId: string): Promise<{
    total: number;
    active: number;
    archived: number;
    byDomain: Record<MemoryDomain, number>;
    lastUpdated: string | null;
  }> {
    const [totalResult, archivedResult, domainResult, lastResult] = await Promise.all([
      this.supabase
        .from('company_memories')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId),
      this.supabase
        .from('company_memories')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('is_archived', true),
      this.supabase
        .from('company_memories')
        .select('domain')
        .eq('company_id', companyId)
        .eq('is_archived', false),
      this.supabase
        .from('company_memories')
        .select('updated_at')
        .eq('company_id', companyId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single(),
    ]);

    const total = totalResult.count ?? 0;
    const archived = archivedResult.count ?? 0;

    // Count by domain
    const byDomain: Record<MemoryDomain, number> = {
      business_context: 0,
      competitors: 0,
      market: 0,
      agents: 0,
    };

    if (domainResult.data) {
      for (const row of domainResult.data) {
        const d = row.domain as MemoryDomain;
        if (byDomain[d] !== undefined) {
          byDomain[d]++;
        }
      }
    }

    return {
      total,
      active: total - archived,
      archived,
      byDomain,
      lastUpdated: lastResult.data?.updated_at ?? null,
    };
  }

  // ===========================================================================
  // EXTRACT: Parse text into atomic facts
  // ===========================================================================

  async extract(
    companyId: string,
    text: string,
    context: {
      sourceAgent?: string;
      sourceCycleId?: string;
      domain?: MemoryDomain;
    } = {}
  ): Promise<CompanyMemory[]> {
    if (!text || text.trim().length < 50) return [];

    // Use Claude to extract atomic facts
    const result = await ClaudeClient.call({
      useCase: 'memory_extraction',
      system: `You are a memory extraction engine. Analyze the following text and extract atomic, self-contained facts that would be valuable to remember.

For each fact, provide:
- domain: "business_context" | "competitors" | "market" | "agents"
- scope: Hierarchical path (e.g., "/business/strategy", "/competitors/acme", "/market/trends")
- topic: Short title (2-5 words)
- content: The atomic fact (1-2 sentences)
- importance: 0.0-1.0 (how important is this to remember?)
- confidence: 0.0-1.0 (how confident are you in this fact?)

Output as JSON array. Only extract facts that are:
- Specific and actionable (not generic observations)
- Novel (would add new knowledge)
- Relevant to business operations

If no valuable facts can be extracted, return an empty array.`,
      messages: [{ role: 'user', content: text }],
    });

    try {
      const jsonMatch = result.text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        domain: MemoryDomain;
        scope: string;
        topic: string;
        content: string;
        importance: number;
        confidence: number;
      }>;

      if (!Array.isArray(parsed) || parsed.length === 0) return [];

      // Validate and prepare inputs
      const validDomains: MemoryDomain[] = ['business_context', 'competitors', 'market', 'agents'];
      const inputs: CompanyMemoryInput[] = parsed
        .filter((f) => validDomains.includes(f.domain))
        .map((f) => ({
          companyId,
          domain: context.domain ?? f.domain,
          scope: f.scope,
          topic: f.topic,
          content: f.content,
          importance: Math.max(0, Math.min(1, f.importance)),
          confidence: Math.max(0, Math.min(1, f.confidence)),
          source: 'agent' as const,
          sourceAgent: context.sourceAgent,
          sourceCycleId: context.sourceCycleId,
        }));

      // Encode all extracted facts
      const memories: CompanyMemory[] = [];
      for (const input of inputs) {
        const memory = await this.encode(input);
        if (memory) memories.push(memory);
      }

      return memories;
    } catch (e) {
      console.error('[CognitiveMemory] Failed to extract memories:', e);
      return [];
    }
  }

  // ===========================================================================
  // CONSOLIDATE: Merge related memories into higher-level insights
  // ===========================================================================

  async consolidate(
    companyId: string,
    options: {
      domain?: MemoryDomain;
      scope?: string;
      minMemories?: number;
    } = {}
  ): Promise<CompanyMemory | null> {
    const { domain, scope, minMemories = 5 } = options;

    // Get memories to consolidate
    let query = this.supabase
      .from('company_memories')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .limit(20);

    if (domain) {
      query = query.eq('domain', domain);
    }
    if (scope) {
      query = query.like('scope', `${scope}%`);
    }

    const { data, error } = await query;

    if (error || !data || data.length < minMemories) {
      return null;
    }

    const memories = data.map(this.mapRow);

    // Use Claude to consolidate
    const memoryText = memories
      .map((m) => `[${m.domain}/${m.scope}] ${m.topic}: ${m.content}`)
      .join('\n');

    const result = await ClaudeClient.call({
      useCase: 'memory_consolidation',
      system: `You are a memory consolidation engine. Analyze the following memories and produce a higher-level insight that captures the pattern or key learning.

Output EXACTLY in this JSON format:
{
  "domain": "business_context" | "competitors" | "market" | "agents",
  "scope": "/consolidated/category",
  "topic": "Summary title (2-5 words)",
  "content": "A concise synthesis that captures the key insight (2-4 sentences)",
  "importance": 0.0-1.0,
  "confidence": 0.0-1.0
}

The consolidated memory should:
- Capture patterns across multiple memories
- Be more abstract than individual facts
- Provide actionable strategic insight`,
      messages: [{ role: 'user', content: memoryText }],
    });

    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);

      // Create consolidated memory
      const consolidated = await this.encode({
        companyId,
        domain: parsed.domain,
        scope: parsed.scope,
        topic: parsed.topic,
        content: parsed.content,
        importance: Math.max(0, Math.min(1, parsed.importance)),
        confidence: Math.max(0, Math.min(1, parsed.confidence)),
        source: 'consolidation',
      });

      if (consolidated) {
        // Archive source memories (mark as superseded)
        for (const memory of memories) {
          await this.supabase
            .from('company_memories')
            .update({
              superseded_by: consolidated.id,
              is_archived: true,
              updated_at: new Date().toISOString(),
            })
            .eq('id', memory.id);
        }
      }

      return consolidated;
    } catch (e) {
      console.error('[CognitiveMemory] Failed to consolidate:', e);
      return null;
    }
  }

  // ===========================================================================
  // FORGET: Selective pruning of low-value memories
  // ===========================================================================

  async forget(
    companyId: string,
    options: {
      olderThanDays?: number;
      maxImportance?: number;
      maxAccessCount?: number;
      domain?: MemoryDomain;
      scope?: string;
      dryRun?: boolean;
    } = {}
  ): Promise<{ count: number; memories: CompanyMemory[] }> {
    const {
      olderThanDays = 90,
      maxImportance = 0.3,
      maxAccessCount = 2,
      domain,
      scope,
      dryRun = false,
    } = options;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    let query = this.supabase
      .from('company_memories')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_archived', false)
      .lt('created_at', cutoffDate.toISOString())
      .lte('importance', maxImportance)
      .lte('times_accessed', maxAccessCount);

    if (domain) {
      query = query.eq('domain', domain);
    }
    if (scope) {
      query = query.like('scope', `${scope}%`);
    }

    const { data, error } = await query;

    if (error || !data) {
      return { count: 0, memories: [] };
    }

    const memories = data.map(this.mapRow);

    if (!dryRun && memories.length > 0) {
      // Archive instead of hard delete (can be recovered)
      await this.supabase
        .from('company_memories')
        .update({
          is_archived: true,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days to permanent deletion
          updated_at: new Date().toISOString(),
        })
        .in(
          'id',
          memories.map((m) => m.id)
        );
    }

    return { count: memories.length, memories };
  }

  /**
   * Permanently delete expired memories
   */
  async purgeExpired(companyId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('company_memories')
      .delete()
      .eq('company_id', companyId)
      .lt('expires_at', new Date().toISOString())
      .select('id');

    if (error) {
      console.error('[CognitiveMemory] Failed to purge:', error);
      return 0;
    }

    return data?.length ?? 0;
  }

  // ===========================================================================
  // USER ACTIONS: Manual memory management
  // ===========================================================================

  async updateMemory(
    id: string,
    updates: {
      content?: string;
      importance?: number;
      confidence?: number;
      topic?: string;
    }
  ): Promise<CompanyMemory | null> {
    const { data, error } = await this.supabase
      .from('company_memories')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[CognitiveMemory] Failed to update:', error);
      return null;
    }

    return this.mapRow(data);
  }

  async archiveMemory(id: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('company_memories')
      .update({
        is_archived: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    return !error;
  }

  async restoreMemory(id: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('company_memories')
      .update({
        is_archived: false,
        superseded_by: null,
        expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    return !error;
  }

  async boostImportance(id: string, boost: number = 0.1): Promise<boolean> {
    const { data } = await this.supabase
      .from('company_memories')
      .select('importance')
      .eq('id', id)
      .single();

    if (!data) return false;

    const newImportance = Math.min(1, (data.importance ?? 0.5) + boost);

    const { error } = await this.supabase
      .from('company_memories')
      .update({
        importance: newImportance,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    return !error;
  }

  /**
   * Backfill embeddings for memories that don't have them.
   * Useful for migration after enabling semantic search.
   */
  async backfillEmbeddings(
    companyId: string,
    options: { batchSize?: number; limit?: number } = {}
  ): Promise<{ processed: number; updated: number }> {
    if (!isEmbeddingsAvailable()) {
      return { processed: 0, updated: 0 };
    }

    const { batchSize = 50, limit = 500 } = options;
    let processed = 0;
    let updated = 0;

    // Find memories without embeddings
    const { data: memories } = await this.supabase
      .from('company_memories')
      .select('id, topic, content')
      .eq('company_id', companyId)
      .is('embedding', null)
      .eq('is_archived', false)
      .limit(limit);

    if (!memories || memories.length === 0) {
      return { processed: 0, updated: 0 };
    }

    // Process in batches
    for (let i = 0; i < memories.length; i += batchSize) {
      const batch = memories.slice(i, i + batchSize);
      const texts = batch.map((m) => `${m.topic}\n\n${m.content}`);

      const embeddings = await generateEmbeddingsBatch(texts);

      for (let j = 0; j < batch.length; j++) {
        processed++;
        const embedding = embeddings[j];

        if (embedding) {
          const { error } = await this.supabase
            .from('company_memories')
            .update({ embedding })
            .eq('id', batch[j].id);

          if (!error) {
            updated++;
          }
        }
      }
    }

    return { processed, updated };
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private async findExisting(
    companyId: string,
    scope: string,
    topic: string
  ): Promise<CompanyMemory | null> {
    const { data } = await this.supabase
      .from('company_memories')
      .select('*')
      .eq('company_id', companyId)
      .eq('scope', scope)
      .eq('topic', topic)
      .eq('is_archived', false)
      .limit(1)
      .single();

    return data ? this.mapRow(data) : null;
  }

  private async updateExisting(
    existing: CompanyMemory,
    input: CompanyMemoryInput
  ): Promise<CompanyMemory | null> {
    // Merge content if different, boost confidence
    const shouldMergeContent = existing.content !== input.content;
    const newContent = shouldMergeContent
      ? `${existing.content}\n\n[Updated]: ${input.content}`
      : existing.content;

    const { data, error } = await this.supabase
      .from('company_memories')
      .update({
        content: newContent.slice(0, 10000),
        confidence: Math.min(1, existing.confidence + 0.1),
        importance: Math.max(existing.importance, input.importance ?? 0.5),
        times_accessed: existing.timesAccessed + 1,
        last_accessed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        source: input.source ?? existing.source,
        source_agent: input.sourceAgent ?? existing.sourceAgent,
        source_cycle_id: input.sourceCycleId ?? existing.sourceCycleId,
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      console.error('[CognitiveMemory] Failed to update existing:', error);
      return null;
    }

    return this.mapRow(data);
  }

  private async evictIfNeeded(companyId: string, domain: MemoryDomain): Promise<void> {
    const { count } = await this.supabase
      .from('company_memories')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('domain', domain)
      .eq('is_archived', false);

    if (count && count >= MAX_MEMORIES_PER_DOMAIN) {
      // Archive least important + least accessed
      const { data: candidates } = await this.supabase
        .from('company_memories')
        .select('id')
        .eq('company_id', companyId)
        .eq('domain', domain)
        .eq('is_archived', false)
        .order('importance', { ascending: true })
        .order('times_accessed', { ascending: true })
        .limit(10);

      if (candidates && candidates[0]) {
        await this.supabase
          .from('company_memories')
          .update({ is_archived: true, updated_at: new Date().toISOString() })
          .eq('id', candidates[0].id);
      }
    }
  }

  private calculateRecallScore(
    memory: CompanyMemory,
    nowMs: number,
    wImportance: number,
    wConfidence: number,
    wRecency: number,
    wFrequency: number
  ): number {
    // Age in days
    const ageMs = nowMs - new Date(memory.lastAccessedAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    // Recency score with exponential decay based on half-life
    const recencyScore = Math.pow(0.5, ageDays / memory.halfLifeDays);

    // Frequency score (logarithmic, capped at 1)
    const frequencyScore = Math.min(1, Math.log(1 + memory.timesAccessed) / Math.log(100));

    // Composite score
    return (
      memory.importance * wImportance +
      memory.confidence * wConfidence +
      recencyScore * wRecency +
      frequencyScore * wFrequency
    );
  }

  private async touchMemories(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    // Fire and forget - don't await
    this.supabase
      .from('company_memories')
      .update({
        times_accessed: this.supabase.rpc('increment', { x: 1 }) as unknown as number,
        last_accessed_at: new Date().toISOString(),
      })
      .in('id', ids)
      .then(() => {});

    // Fallback: increment each individually (RPC may not exist)
    for (const id of ids) {
      this.supabase
        .from('company_memories')
        .select('times_accessed')
        .eq('id', id)
        .single()
        .then(({ data }) => {
          if (data) {
            this.supabase
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

  private mapRow(row: Record<string, unknown>): CompanyMemory {
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
      // Advanced cognitive features
      embedding: row.embedding as number[] | undefined,
      reinforcementCount: row.reinforcement_count as number | undefined,
    };
  }
}

// Singleton factory for server-side usage
let instance: CognitiveMemoryStore | null = null;

export function getCognitiveMemoryStore(supabase: SupabaseClient): CognitiveMemoryStore {
  if (!instance) {
    instance = new CognitiveMemoryStore(supabase);
  }
  return instance;
}

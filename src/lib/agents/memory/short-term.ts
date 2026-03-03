import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentRole, MemoryType, ShortTermMemory } from '../../types';

export interface ShortTermStoreInput {
  companyId: string;
  agentRole: AgentRole;
  topic: string;
  content: string;
  memoryType: MemoryType;
  relevanceScore?: number;
}

export interface ShortTermQueryOptions {
  companyId: string;
  agentRole?: AgentRole;
  topic?: string;
  memoryType?: MemoryType;
  since?: string; // ISO date
  limit?: number;
}

export class ShortTermMemoryStore {
  constructor(private supabase: SupabaseClient) {}

  async store(entry: ShortTermStoreInput): Promise<ShortTermMemory | null> {
    // Validate content length
    const content = entry.content.slice(0, 10000);

    const { data, error } = await this.supabase
      .from('agent_memory_short_term')
      .insert({
        company_id: entry.companyId,
        agent_role: entry.agentRole,
        topic: entry.topic,
        content,
        memory_type: entry.memoryType,
        relevance_score: entry.relevanceScore ?? 0.5,
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to store short-term memory:', error);
      return null;
    }

    return this.mapRow(data);
  }

  async query(options: ShortTermQueryOptions): Promise<ShortTermMemory[]> {
    let query = this.supabase
      .from('agent_memory_short_term')
      .select('*')
      .eq('company_id', options.companyId)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(options.limit ?? 50);

    if (options.agentRole) {
      query = query.eq('agent_role', options.agentRole);
    }
    if (options.topic) {
      query = query.eq('topic', options.topic);
    }
    if (options.memoryType) {
      query = query.eq('memory_type', options.memoryType);
    }
    if (options.since) {
      query = query.gte('created_at', options.since);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to query short-term memory:', error);
      return [];
    }

    return (data || []).map(this.mapRow);
  }

  async getRecentForAgent(companyId: string, agentRole: AgentRole, limit: number = 20): Promise<ShortTermMemory[]> {
    return this.query({ companyId, agentRole, limit });
  }

  async incrementRelevance(id: string): Promise<void> {
    const { data } = await this.supabase
      .from('agent_memory_short_term')
      .select('relevance_score')
      .eq('id', id)
      .single();

    if (data) {
      const newScore = Math.min((data.relevance_score || 0.5) + 0.1, 1.0);
      await this.supabase
        .from('agent_memory_short_term')
        .update({ relevance_score: newScore })
        .eq('id', id);
    }
  }

  async prune(): Promise<number> {
    const { data, error } = await this.supabase
      .from('agent_memory_short_term')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id');

    if (error) {
      console.error('Failed to prune expired memories:', error);
      return 0;
    }

    return data?.length ?? 0;
  }

  private mapRow(row: Record<string, unknown>): ShortTermMemory {
    return {
      id: row.id as string,
      companyId: row.company_id as string,
      agentRole: row.agent_role as AgentRole,
      topic: row.topic as string,
      content: row.content as string,
      memoryType: row.memory_type as MemoryType,
      relevanceScore: row.relevance_score as number,
      expiresAt: row.expires_at as string,
      createdAt: row.created_at as string,
    };
  }
}

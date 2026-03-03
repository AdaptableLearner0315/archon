import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentRole, LongTermCategory, LongTermMemory, ShortTermMemory } from '../../types';
import { ClaudeClient } from '../claude-client';

const MAX_ENTRIES_PER_AGENT = 100;

export class LongTermMemoryStore {
  constructor(private supabase: SupabaseClient) {}

  async query(
    companyId: string,
    options: {
      agentRole?: AgentRole;
      category?: LongTermCategory;
      limit?: number;
    } = {}
  ): Promise<LongTermMemory[]> {
    let query = this.supabase
      .from('agent_memory_long_term')
      .select('*')
      .eq('company_id', companyId)
      .order('last_referenced_at', { ascending: false })
      .limit(options.limit ?? 20);

    if (options.agentRole) {
      query = query.eq('agent_role', options.agentRole);
    }
    if (options.category) {
      query = query.eq('category', options.category);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to query long-term memory:', error);
      return [];
    }

    return (data || []).map(this.mapRow);
  }

  async condenseFromShortTerm(
    companyId: string,
    agentRole: AgentRole,
    shortTermMemories: ShortTermMemory[]
  ): Promise<LongTermMemory | null> {
    if (shortTermMemories.length < 3) return null;

    const memoryText = shortTermMemories
      .map((m) => `[${m.memoryType}] ${m.topic}: ${m.content}`)
      .join('\n');

    const result = await ClaudeClient.call({
      useCase: 'memory_condensation',
      system: `You are a memory condensation engine. Analyze the following short-term memories from the ${agentRole} agent and produce a structured summary.

Output EXACTLY in this JSON format:
{
  "category": "pattern" | "strategy" | "company_knowledge" | "agent_behavior" | "market_insight",
  "summary": "A concise lasting insight (1-3 sentences)",
  "confidence": 0.0 to 1.0
}

Choose the most appropriate category. Be concise but capture the key insight.`,
      messages: [{ role: 'user', content: memoryText }],
    });

    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]) as {
        category: LongTermCategory;
        summary: string;
        confidence: number;
      };

      // Validate category
      const validCategories: LongTermCategory[] = ['pattern', 'strategy', 'company_knowledge', 'agent_behavior', 'market_insight'];
      if (!validCategories.includes(parsed.category)) return null;

      // Enforce per-agent cap — evict LRU if needed
      await this.evictIfNeeded(companyId, agentRole);

      const { data, error } = await this.supabase
        .from('agent_memory_long_term')
        .insert({
          company_id: companyId,
          agent_role: agentRole,
          category: parsed.category,
          summary: parsed.summary.slice(0, 5000),
          confidence: Math.max(0, Math.min(1, parsed.confidence)),
        })
        .select()
        .single();

      if (error) {
        console.error('Failed to store long-term memory:', error);
        return null;
      }

      return this.mapRow(data);
    } catch (e) {
      console.error('Failed to parse condensation result:', e);
      return null;
    }
  }

  async markReferenced(id: string): Promise<void> {
    await this.supabase.rpc('increment_ltm_reference', { memory_id: id }).then(() => {});
    // Fallback if RPC doesn't exist
    const { data } = await this.supabase
      .from('agent_memory_long_term')
      .select('times_referenced')
      .eq('id', id)
      .single();

    if (data) {
      await this.supabase
        .from('agent_memory_long_term')
        .update({
          times_referenced: (data.times_referenced || 0) + 1,
          last_referenced_at: new Date().toISOString(),
        })
        .eq('id', id);
    }
  }

  private async evictIfNeeded(companyId: string, agentRole: AgentRole): Promise<void> {
    const { count } = await this.supabase
      .from('agent_memory_long_term')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('agent_role', agentRole);

    if (count && count >= MAX_ENTRIES_PER_AGENT) {
      // Delete least recently referenced
      const { data: oldest } = await this.supabase
        .from('agent_memory_long_term')
        .select('id')
        .eq('company_id', companyId)
        .eq('agent_role', agentRole)
        .order('last_referenced_at', { ascending: true })
        .limit(1);

      if (oldest && oldest[0]) {
        await this.supabase
          .from('agent_memory_long_term')
          .delete()
          .eq('id', oldest[0].id);
      }
    }
  }

  private mapRow(row: Record<string, unknown>): LongTermMemory {
    return {
      id: row.id as string,
      companyId: row.company_id as string,
      agentRole: row.agent_role as AgentRole,
      category: row.category as LongTermCategory,
      summary: row.summary as string,
      confidence: row.confidence as number,
      timesReferenced: row.times_referenced as number,
      lastReferencedAt: row.last_referenced_at as string,
      createdAt: row.created_at as string,
    };
  }
}

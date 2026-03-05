import type { AgentRole, MemoryContext, WorkingMemoryEntry, ShortTermMemory, LongTermMemory, CompanyMemory } from '../../types';
import type { WorkingMemory } from './working-memory';
import type { ShortTermMemoryStore } from './short-term';
import type { LongTermMemoryStore } from './long-term';
import { CognitiveMemoryStore } from '../../memory/store';
import type { SupabaseClient } from '@supabase/supabase-js';

const MAX_TOKEN_BUDGET = 2000; // Increased to accommodate company memories
const CHARS_PER_TOKEN = 4;
const MAX_CHAR_BUDGET = MAX_TOKEN_BUDGET * CHARS_PER_TOKEN;

export class ContextBuilder {
  private cognitiveStore: CognitiveMemoryStore | null = null;

  constructor(
    private workingMemory: WorkingMemory | null,
    private shortTermStore: ShortTermMemoryStore,
    private longTermStore: LongTermMemoryStore,
    supabase?: SupabaseClient
  ) {
    if (supabase) {
      this.cognitiveStore = new CognitiveMemoryStore(supabase);
    }
  }

  async buildContext(
    companyId: string,
    agentRole: AgentRole,
    taskDescription?: string
  ): Promise<MemoryContext> {
    // Load all memory tiers in parallel
    const [longTermMems, shortTermMems, companyMems] = await Promise.all([
      this.longTermStore.query(companyId, { agentRole, limit: 15 }),
      this.shortTermStore.getRecentForAgent(companyId, agentRole, 20),
      this.loadCompanyMemories(companyId),
    ]);

    const workingMems = this.workingMemory
      ? this.workingMemory.getAll(agentRole)
      : [];

    // Estimate tokens and trim if needed
    let totalChars = 0;
    const selectedCompany: CompanyMemory[] = [];
    const selectedLTM: LongTermMemory[] = [];
    const selectedSTM: ShortTermMemory[] = [];
    const selectedWM: WorkingMemoryEntry[] = [];

    // Priority 1: Company memories (cognitive backbone) - highest signal
    for (const mem of companyMems) {
      const memChars = mem.content.length + mem.topic.length + mem.domain.length + 30;
      if (totalChars + memChars > MAX_CHAR_BUDGET * 0.4) break; // Reserve 40% for company memories
      totalChars += memChars;
      selectedCompany.push(mem);
    }

    // Priority 2: Agent-specific long-term memories
    for (const mem of longTermMems) {
      const memChars = mem.summary.length + mem.category.length + 20;
      if (totalChars + memChars > MAX_CHAR_BUDGET * 0.7) break; // Reserve 30% more
      totalChars += memChars;
      selectedLTM.push(mem);
    }

    // Priority 3: Short-term memories
    for (const mem of shortTermMems) {
      const memChars = Math.min(mem.content.length, 300) + mem.topic.length + 20;
      if (totalChars + memChars > MAX_CHAR_BUDGET * 0.9) break;
      totalChars += memChars;
      selectedSTM.push(mem);
    }

    // Priority 4: Working memory
    for (const mem of workingMems) {
      const memChars = Math.min(String(mem.value).length, 200) + mem.key.length + 10;
      if (totalChars + memChars > MAX_CHAR_BUDGET) break;
      totalChars += memChars;
      selectedWM.push(mem);
    }

    return {
      workingMemory: selectedWM,
      shortTermMemories: selectedSTM,
      longTermMemories: selectedLTM,
      companyMemories: selectedCompany,
      tokenEstimate: Math.ceil(totalChars / CHARS_PER_TOKEN),
    };
  }

  private async loadCompanyMemories(companyId: string): Promise<CompanyMemory[]> {
    if (!this.cognitiveStore) return [];

    try {
      // Recall high-importance memories across all domains
      const results = await this.cognitiveStore.recall({
        companyId,
        limit: 30,
        minImportance: 0.4,
        weightImportance: 0.4,
        weightConfidence: 0.2,
        weightRecency: 0.2,
        weightFrequency: 0.2,
      });

      return results.map((r) => r.memory);
    } catch (error) {
      console.error('[ContextBuilder] Failed to load company memories:', error);
      return [];
    }
  }

  formatForPrompt(context: MemoryContext): string {
    const sections: string[] = [];

    // Company Memories (Cognitive Backbone) - organized by domain
    if (context.companyMemories && context.companyMemories.length > 0) {
      sections.push('## Company Knowledge Base\n');

      // Group by domain
      const byDomain = this.groupByDomain(context.companyMemories);

      if (byDomain.business_context.length > 0) {
        sections.push('### Business Context');
        for (const mem of byDomain.business_context) {
          const clean = this.sanitizeContent(mem.content);
          sections.push(`- **${mem.topic}**: ${clean}`);
        }
      }

      if (byDomain.competitors.length > 0) {
        sections.push('\n### Competitors');
        for (const mem of byDomain.competitors) {
          const clean = this.sanitizeContent(mem.content);
          sections.push(`- **${mem.topic}**: ${clean}`);
        }
      }

      if (byDomain.market.length > 0) {
        sections.push('\n### Market Intelligence');
        for (const mem of byDomain.market) {
          const clean = this.sanitizeContent(mem.content);
          sections.push(`- **${mem.topic}**: ${clean}`);
        }
      }

      if (byDomain.agents.length > 0) {
        sections.push('\n### Agent Learnings');
        for (const mem of byDomain.agents) {
          const clean = this.sanitizeContent(mem.content);
          sections.push(`- **${mem.topic}**: ${clean}`);
        }
      }
    }

    // Agent-specific long-term memories
    if (context.longTermMemories.length > 0) {
      sections.push('\n## Your Learned Patterns');
      for (const mem of context.longTermMemories) {
        const clean = this.sanitizeContent(mem.summary);
        sections.push(`- **[${mem.category}]** ${clean} _(confidence: ${mem.confidence.toFixed(1)})_`);
      }
    }

    // Recent context from short-term memory
    if (context.shortTermMemories.length > 0) {
      sections.push('\n## Recent Context');
      for (const mem of context.shortTermMemories) {
        const clean = this.sanitizeContent(mem.content).slice(0, 300);
        sections.push(`- **[${mem.memoryType}]** ${mem.topic}: ${clean}`);
      }
    }

    // Current cycle working memory
    if (context.workingMemory.length > 0) {
      sections.push('\n## Current Cycle');
      for (const mem of context.workingMemory) {
        const valueStr = typeof mem.value === 'string'
          ? mem.value.slice(0, 200)
          : JSON.stringify(mem.value).slice(0, 200);
        sections.push(`- **${mem.key}**: ${valueStr}`);
      }
    }

    return sections.join('\n');
  }

  private groupByDomain(memories: CompanyMemory[]): Record<string, CompanyMemory[]> {
    const groups: Record<string, CompanyMemory[]> = {
      business_context: [],
      competitors: [],
      market: [],
      agents: [],
    };

    for (const mem of memories) {
      if (groups[mem.domain]) {
        groups[mem.domain].push(mem);
      }
    }

    return groups;
  }

  private sanitizeContent(content: string): string {
    return content
      .replace(/\[REQUEST:.*?\]/g, '')
      .replace(/\[DECISION:.*?\]/g, '')
      .replace(/\[BLOCKED:.*?\]/g, '')
      .trim();
  }
}

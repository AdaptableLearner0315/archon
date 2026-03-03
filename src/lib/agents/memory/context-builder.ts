import type { AgentRole, MemoryContext, WorkingMemoryEntry, ShortTermMemory, LongTermMemory } from '../../types';
import type { WorkingMemory } from './working-memory';
import type { ShortTermMemoryStore } from './short-term';
import type { LongTermMemoryStore } from './long-term';

const MAX_TOKEN_BUDGET = 1500;
const CHARS_PER_TOKEN = 4;
const MAX_CHAR_BUDGET = MAX_TOKEN_BUDGET * CHARS_PER_TOKEN;

export class ContextBuilder {
  constructor(
    private workingMemory: WorkingMemory | null,
    private shortTermStore: ShortTermMemoryStore,
    private longTermStore: LongTermMemoryStore
  ) {}

  async buildContext(
    companyId: string,
    agentRole: AgentRole,
    taskDescription?: string
  ): Promise<MemoryContext> {
    // Load all 3 tiers in parallel
    const [longTermMems, shortTermMems] = await Promise.all([
      this.longTermStore.query(companyId, { agentRole, limit: 15 }),
      this.shortTermStore.getRecentForAgent(companyId, agentRole, 20),
    ]);

    const workingMems = this.workingMemory
      ? this.workingMemory.getAll(agentRole)
      : [];

    // Estimate tokens and trim if needed
    let totalChars = 0;
    const selectedLTM: LongTermMemory[] = [];
    const selectedSTM: ShortTermMemory[] = [];
    const selectedWM: WorkingMemoryEntry[] = [];

    // Priority: long-term first (highest signal)
    for (const mem of longTermMems) {
      const memChars = mem.summary.length + mem.category.length + 20;
      if (totalChars + memChars > MAX_CHAR_BUDGET) break;
      totalChars += memChars;
      selectedLTM.push(mem);
    }

    // Then short-term
    for (const mem of shortTermMems) {
      const memChars = Math.min(mem.content.length, 300) + mem.topic.length + 20;
      if (totalChars + memChars > MAX_CHAR_BUDGET) break;
      totalChars += memChars;
      selectedSTM.push(mem);
    }

    // Then working memory
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
      tokenEstimate: Math.ceil(totalChars / CHARS_PER_TOKEN),
    };
  }

  formatForPrompt(context: MemoryContext): string {
    const sections: string[] = [];

    if (context.longTermMemories.length > 0) {
      sections.push('## Company Knowledge');
      for (const mem of context.longTermMemories) {
        // Strip markers to prevent prompt injection from historical data
        const clean = mem.summary
          .replace(/\[REQUEST:.*?\]/g, '')
          .replace(/\[DECISION:.*?\]/g, '')
          .trim();
        sections.push(`- **[${mem.category}]** ${clean} _(confidence: ${mem.confidence.toFixed(1)})_`);
      }
    }

    if (context.shortTermMemories.length > 0) {
      sections.push('\n## Your Recent Context');
      for (const mem of context.shortTermMemories) {
        const clean = mem.content
          .replace(/\[REQUEST:.*?\]/g, '')
          .replace(/\[DECISION:.*?\]/g, '')
          .trim()
          .slice(0, 300);
        sections.push(`- **[${mem.memoryType}]** ${mem.topic}: ${clean}`);
      }
    }

    if (context.workingMemory.length > 0) {
      sections.push('\n## Current Cycle Context');
      for (const mem of context.workingMemory) {
        const valueStr = typeof mem.value === 'string'
          ? mem.value.slice(0, 200)
          : JSON.stringify(mem.value).slice(0, 200);
        sections.push(`- **${mem.key}**: ${valueStr}`);
      }
    }

    return sections.join('\n');
  }
}

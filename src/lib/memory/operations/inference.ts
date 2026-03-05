/**
 * Cross-Domain Inference Operation
 *
 * Generates new insights by connecting memories across domains.
 * Creates 'inference' source memories that derive from existing facts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyMemory, MemoryDomain, CompanyMemoryInput } from '../../types';
import { ClaudeClient } from '../../agents/claude-client';
import { CognitiveMemoryStore } from '../store';
import { createAssociation } from './associate';

interface InferenceResult {
  insight: CompanyMemory;
  sourceMemories: string[]; // IDs of memories used to generate this insight
}

/**
 * Generate cross-domain insights from existing memories.
 * Connects patterns across different knowledge domains.
 */
export async function generateCrossDomainInsights(
  supabase: SupabaseClient,
  companyId: string,
  options: {
    maxInsights?: number;
    minSourceMemories?: number;
  } = {}
): Promise<InferenceResult[]> {
  const { maxInsights = 3, minSourceMemories = 4 } = options;
  const results: InferenceResult[] = [];

  // Get top memories from each domain
  const domainMemories = await getTopMemoriesPerDomain(supabase, companyId);

  // Check if we have enough material
  const totalMemories = Object.values(domainMemories).flat().length;
  if (totalMemories < minSourceMemories) {
    return [];
  }

  // Prepare context for Claude
  const memoryContext = formatMemoriesForAnalysis(domainMemories);

  // Ask Claude to find cross-domain connections
  const analysis = await analyzeForInsights(memoryContext, maxInsights);

  if (!analysis || analysis.length === 0) {
    return [];
  }

  const store = new CognitiveMemoryStore(supabase);

  // Create insight memories
  for (const insight of analysis) {
    const input: CompanyMemoryInput = {
      companyId,
      domain: determineBestDomain(insight.domains),
      scope: '/insights/cross_domain',
      topic: insight.title,
      content: insight.insight,
      importance: 0.75, // Insights are moderately important
      confidence: 0.7, // Lower confidence since they're inferred
      source: 'inference',
    };

    const memory = await store.encode(input);

    if (memory) {
      // Create derives_from associations to source memories
      for (const sourceId of insight.sourceIds) {
        await createAssociation(supabase, {
          companyId,
          memoryAId: memory.id,
          memoryBId: sourceId,
          relationshipType: 'derives_from',
          strength: 0.8,
          createdBy: 'inference',
        });
      }

      results.push({
        insight: memory,
        sourceMemories: insight.sourceIds,
      });
    }
  }

  return results;
}

/**
 * Get top memories from each domain for cross-domain analysis.
 */
async function getTopMemoriesPerDomain(
  supabase: SupabaseClient,
  companyId: string,
  limit: number = 5
): Promise<Record<MemoryDomain, CompanyMemory[]>> {
  const domains: MemoryDomain[] = ['business_context', 'competitors', 'market', 'agents'];
  const result: Record<MemoryDomain, CompanyMemory[]> = {
    business_context: [],
    competitors: [],
    market: [],
    agents: [],
  };

  for (const domain of domains) {
    const { data } = await supabase
      .from('company_memories')
      .select('*')
      .eq('company_id', companyId)
      .eq('domain', domain)
      .eq('is_archived', false)
      .order('importance', { ascending: false })
      .limit(limit);

    if (data) {
      result[domain] = data.map(mapRow);
    }
  }

  return result;
}

/**
 * Format memories for Claude analysis.
 */
function formatMemoriesForAnalysis(
  domainMemories: Record<MemoryDomain, CompanyMemory[]>
): string {
  const sections: string[] = [];

  const domainLabels: Record<MemoryDomain, string> = {
    business_context: 'Business Context',
    competitors: 'Competitors',
    market: 'Market Intelligence',
    agents: 'Agent Learnings',
  };

  for (const [domain, memories] of Object.entries(domainMemories)) {
    if (memories.length === 0) continue;

    sections.push(`## ${domainLabels[domain as MemoryDomain]}`);

    for (const memory of memories) {
      sections.push(`- [${memory.id}] ${memory.topic}: ${memory.content}`);
    }

    sections.push('');
  }

  return sections.join('\n');
}

/**
 * Ask Claude to find cross-domain insights.
 */
async function analyzeForInsights(
  memoryContext: string,
  maxInsights: number
): Promise<
  | {
      title: string;
      insight: string;
      domains: MemoryDomain[];
      sourceIds: string[];
    }[]
  | null
> {
  try {
    const result = await ClaudeClient.call({
      useCase: 'memory_consolidation',
      system: `You are a strategic insight generator. Analyze the provided memories from different domains and find non-obvious connections that could provide strategic value.

Look for:
1. Patterns that span multiple domains (e.g., competitor weakness + market pain point = opportunity)
2. Contradictions or tensions that need resolution
3. Emerging trends visible across domains
4. Strategic opportunities or risks

For each insight:
- Connect at least 2 different domains
- Reference specific memories by their [ID]
- Provide actionable strategic value

Output JSON array:
[
  {
    "title": "Short insight title (5-10 words)",
    "insight": "The strategic insight with reasoning (2-4 sentences)",
    "domains": ["domain1", "domain2"],
    "sourceIds": ["memory_id_1", "memory_id_2"]
  }
]

Generate up to ${maxInsights} insights. If no meaningful cross-domain insights exist, return an empty array.`,
      messages: [{ role: 'user', content: memoryContext }],
    });

    const jsonMatch = result.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(parsed)) return null;

    return parsed
      .filter(
        (item: Record<string, unknown>) =>
          item.title &&
          item.insight &&
          Array.isArray(item.domains) &&
          Array.isArray(item.sourceIds) &&
          item.sourceIds.length >= 2
      )
      .slice(0, maxInsights);
  } catch (error) {
    console.error('[Inference] Failed to generate insights:', error);
    return null;
  }
}

/**
 * Determine the best domain for an insight based on its source domains.
 */
function determineBestDomain(domains: MemoryDomain[]): MemoryDomain {
  // Priority order for insight storage
  const priority: MemoryDomain[] = ['market', 'business_context', 'competitors', 'agents'];

  for (const domain of priority) {
    if (domains.includes(domain)) {
      return domain;
    }
  }

  return 'business_context';
}

/**
 * Generate insights triggered by a specific event or topic.
 */
export async function generateTriggeredInsights(
  supabase: SupabaseClient,
  companyId: string,
  trigger: {
    topic: string;
    context: string;
  },
  options: { maxInsights?: number } = {}
): Promise<InferenceResult[]> {
  const { maxInsights = 2 } = options;

  // Get memories related to the trigger
  const { data: relevantMemories } = await supabase
    .from('company_memories')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_archived', false)
    .or(`topic.ilike.%${trigger.topic}%,content.ilike.%${trigger.topic}%`)
    .limit(10);

  if (!relevantMemories || relevantMemories.length < 2) {
    return [];
  }

  // Get some contrasting memories from other domains
  const relevantDomains = new Set(relevantMemories.map((m) => m.domain));
  const otherDomains = ['business_context', 'competitors', 'market', 'agents'].filter(
    (d) => !relevantDomains.has(d)
  );

  const { data: contrastingMemories } = await supabase
    .from('company_memories')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_archived', false)
    .in('domain', otherDomains)
    .order('importance', { ascending: false })
    .limit(5);

  // Combine memories
  const allMemories = [...relevantMemories, ...(contrastingMemories || [])].map(mapRow);

  // Group by domain
  const grouped: Record<MemoryDomain, CompanyMemory[]> = {
    business_context: [],
    competitors: [],
    market: [],
    agents: [],
  };

  for (const memory of allMemories) {
    grouped[memory.domain].push(memory);
  }

  // Add trigger context
  const memoryContext =
    `Trigger Topic: ${trigger.topic}\nContext: ${trigger.context}\n\n` +
    formatMemoriesForAnalysis(grouped);

  const analysis = await analyzeForInsights(memoryContext, maxInsights);

  if (!analysis || analysis.length === 0) {
    return [];
  }

  const store = new CognitiveMemoryStore(supabase);
  const results: InferenceResult[] = [];

  for (const insight of analysis) {
    const input: CompanyMemoryInput = {
      companyId,
      domain: determineBestDomain(insight.domains),
      scope: `/insights/triggered/${trigger.topic.toLowerCase().replace(/\s+/g, '_')}`,
      topic: insight.title,
      content: insight.insight,
      importance: 0.7,
      confidence: 0.65,
      source: 'inference',
    };

    const memory = await store.encode(input);

    if (memory) {
      for (const sourceId of insight.sourceIds) {
        await createAssociation(supabase, {
          companyId,
          memoryAId: memory.id,
          memoryBId: sourceId,
          relationshipType: 'derives_from',
          strength: 0.75,
          createdBy: 'inference',
        });
      }

      results.push({
        insight: memory,
        sourceMemories: insight.sourceIds,
      });
    }
  }

  return results;
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

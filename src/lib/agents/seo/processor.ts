/**
 * SEO Task Processor
 * Processes SEO-specific markers and stores audit results
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { crawlUrl, formatCrawlResultForAgent, type CrawlResult } from './crawler';

const CRAWL_URL_REGEX = /\[CRAWL_URL:\s*(.+?)\]/g;

export interface SEOProcessorResult {
  crawlsPerformed: number;
  crawlResults: CrawlResult[];
  injectedContext: string;
}

/**
 * Process SEO markers in agent output
 * Returns context to inject back into the agent for rerun
 */
export async function processSEOMarkers(
  text: string,
  companyId: string,
  cycleId: string | null,
  supabase: SupabaseClient
): Promise<SEOProcessorResult> {
  const crawlResults: CrawlResult[] = [];
  const contextSections: string[] = [];

  // Find all [CRAWL_URL: ...] markers
  const regex = new RegExp(CRAWL_URL_REGEX.source, 'g');
  let match;

  while ((match = regex.exec(text)) !== null) {
    const url = match[1].trim();

    try {
      // Perform crawl
      const result = await crawlUrl(url);
      crawlResults.push(result);

      // Format for agent context
      const formatted = formatCrawlResultForAgent(result);
      contextSections.push(formatted);

      // Store audit in database
      await storeSEOAudit(companyId, cycleId, result, supabase);
    } catch (error) {
      console.error(`Failed to crawl ${url}:`, error);
      contextSections.push(`## Crawl Failed: ${url}\nError: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return {
    crawlsPerformed: crawlResults.length,
    crawlResults,
    injectedContext: contextSections.join('\n\n---\n\n'),
  };
}

/**
 * Store SEO audit results in database
 */
async function storeSEOAudit(
  companyId: string,
  cycleId: string | null,
  result: CrawlResult,
  supabase: SupabaseClient
): Promise<void> {
  // Calculate an overall score based on issues
  const baseScore = 100;
  const penaltyPerIssue = 5;
  const score = Math.max(0, baseScore - (result.issues.length * penaltyPerIssue));

  // Determine audit type based on what data was collected
  let auditType: 'technical' | 'on_page' | 'keywords' = 'on_page';
  if (result.issues.some(i => i.includes('load') || i.includes('viewport') || i.includes('lang'))) {
    auditType = 'technical';
  }

  await supabase.from('seo_audits').insert({
    company_id: companyId,
    cycle_id: cycleId,
    url: result.url,
    audit_type: auditType,
    results: {
      statusCode: result.statusCode,
      loadTimeMs: result.loadTimeMs,
      title: result.title,
      metaDescription: result.metaDescription,
      h1Count: result.h1.length,
      h2Count: result.h2.length,
      imageCount: result.images.length,
      imagesWithoutAlt: result.images.filter(i => !i.alt).length,
      internalLinkCount: result.internalLinks.length,
      externalLinkCount: result.externalLinks.length,
      wordCount: result.wordCount,
      hasCanonical: !!result.canonicalUrl,
      hasStructuredData: result.structuredData.length > 0,
      ogTagCount: Object.keys(result.ogTags).length,
      issues: result.issues,
    },
    score,
  });
}

/**
 * Batch crawl multiple URLs for comprehensive site audit
 */
export async function batchCrawl(
  urls: string[],
  companyId: string,
  cycleId: string | null,
  supabase: SupabaseClient,
  options: { concurrency?: number; delayMs?: number } = {}
): Promise<CrawlResult[]> {
  const { concurrency = 3, delayMs = 500 } = options;
  const results: CrawlResult[] = [];

  // Process in batches
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (url) => {
        try {
          const result = await crawlUrl(url);
          await storeSEOAudit(companyId, cycleId, result, supabase);
          return result;
        } catch (error) {
          console.error(`Batch crawl failed for ${url}:`, error);
          return null;
        }
      })
    );

    results.push(...batchResults.filter((r): r is CrawlResult => r !== null));

    // Delay between batches to avoid overwhelming servers
    if (i + concurrency < urls.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

/**
 * Get SEO audit history for a company
 */
export async function getAuditHistory(
  companyId: string,
  supabase: SupabaseClient,
  options: { limit?: number; url?: string } = {}
): Promise<{ audits: unknown[]; avgScore: number }> {
  const { limit = 20, url } = options;

  let query = supabase
    .from('seo_audits')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (url) {
    query = query.eq('url', url);
  }

  const { data: audits, error } = await query;

  if (error || !audits) {
    return { audits: [], avgScore: 0 };
  }

  const avgScore = audits.length > 0
    ? audits.reduce((sum, a) => sum + (a.score || 0), 0) / audits.length
    : 0;

  return { audits, avgScore };
}

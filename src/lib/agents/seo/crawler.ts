/**
 * SEO Website Crawler
 * Lightweight HTML parsing for SEO audits - no headless browser needed
 */

import * as cheerio from 'cheerio';

export interface CrawlResult {
  url: string;
  statusCode: number;
  title: string;
  metaDescription: string;
  metaKeywords: string;
  h1: string[];
  h2: string[];
  h3: string[];
  images: { src: string; alt: string | null; width: string | null; height: string | null }[];
  internalLinks: string[];
  externalLinks: string[];
  canonicalUrl: string | null;
  robots: string | null;
  ogTags: Record<string, string>;
  structuredData: object[];
  wordCount: number;
  loadTimeMs: number;
  issues: string[];
}

export interface CrawlOptions {
  timeout?: number;
  userAgent?: string;
}

const DEFAULT_USER_AGENT = 'Archon-SEO-Bot/1.0 (+https://archon.app/bot)';
const DEFAULT_TIMEOUT = 10000;

export async function crawlUrl(
  url: string,
  options: CrawlOptions = {}
): Promise<CrawlResult> {
  const startTime = performance.now();
  const issues: string[] = [];

  const { timeout = DEFAULT_TIMEOUT, userAgent = DEFAULT_USER_AGENT } = options;

  try {
    // Validate URL
    const parsedUrl = new URL(url);
    const baseHost = parsedUrl.host;

    // Fetch the page
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    const loadTimeMs = Math.round(performance.now() - startTime);
    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract title
    const title = $('title').first().text().trim();
    if (!title) issues.push('Missing <title> tag');
    else if (title.length > 60) issues.push(`Title too long (${title.length} chars, recommended <60)`);
    else if (title.length < 30) issues.push(`Title may be too short (${title.length} chars)`);

    // Extract meta description
    const metaDescription = $('meta[name="description"]').attr('content')?.trim() || '';
    if (!metaDescription) issues.push('Missing meta description');
    else if (metaDescription.length > 160) issues.push(`Meta description too long (${metaDescription.length} chars, recommended <160)`);
    else if (metaDescription.length < 70) issues.push(`Meta description may be too short (${metaDescription.length} chars)`);

    // Extract meta keywords
    const metaKeywords = $('meta[name="keywords"]').attr('content')?.trim() || '';

    // Extract headings
    const h1: string[] = [];
    $('h1').each((_, el) => {
      const text = $(el).text().trim();
      if (text) h1.push(text);
    });
    if (h1.length === 0) issues.push('Missing H1 heading');
    else if (h1.length > 1) issues.push(`Multiple H1 tags found (${h1.length}) - should have only one`);

    const h2: string[] = [];
    $('h2').each((_, el) => {
      const text = $(el).text().trim();
      if (text) h2.push(text);
    });

    const h3: string[] = [];
    $('h3').each((_, el) => {
      const text = $(el).text().trim();
      if (text) h3.push(text);
    });

    // Extract images
    const images: CrawlResult['images'] = [];
    $('img').each((_, el) => {
      const src = $(el).attr('src') || '';
      const alt = $(el).attr('alt') ?? null;
      const width = $(el).attr('width') ?? null;
      const height = $(el).attr('height') ?? null;

      if (src) {
        images.push({ src, alt, width, height });
        if (alt === null || alt === '') {
          issues.push(`Image missing alt text: ${src.slice(0, 50)}`);
        }
      }
    });

    // Extract links
    const internalLinks: string[] = [];
    const externalLinks: string[] = [];

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      try {
        const linkUrl = new URL(href, url);
        if (linkUrl.host === baseHost) {
          internalLinks.push(linkUrl.pathname + linkUrl.search);
        } else {
          externalLinks.push(linkUrl.href);
        }
      } catch {
        // Relative link or malformed
        if (href.startsWith('/') || href.startsWith('#')) {
          internalLinks.push(href);
        }
      }
    });

    // Extract canonical
    const canonicalUrl = $('link[rel="canonical"]').attr('href') ?? null;
    if (!canonicalUrl) issues.push('Missing canonical URL');

    // Extract robots meta
    const robots = $('meta[name="robots"]').attr('content') ?? null;

    // Extract Open Graph tags
    const ogTags: Record<string, string> = {};
    $('meta[property^="og:"]').each((_, el) => {
      const property = $(el).attr('property')?.replace('og:', '') || '';
      const content = $(el).attr('content') || '';
      if (property && content) ogTags[property] = content;
    });

    // Extract structured data (JSON-LD)
    const structuredData: object[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).html() || '');
        structuredData.push(json);
      } catch {
        issues.push('Invalid JSON-LD structured data found');
      }
    });

    // Calculate word count (text content only)
    const textContent = $('body').text().replace(/\s+/g, ' ').trim();
    const wordCount = textContent.split(/\s+/).filter(Boolean).length;
    if (wordCount < 300) issues.push(`Low word count (${wordCount}) - consider adding more content`);

    // Additional SEO checks
    if (loadTimeMs > 3000) issues.push(`Slow page load (${loadTimeMs}ms) - may impact rankings`);
    if (!$('meta[name="viewport"]').length) issues.push('Missing viewport meta tag (mobile-friendliness)');
    if (!$('html').attr('lang')) issues.push('Missing lang attribute on <html> tag');

    return {
      url,
      statusCode: response.status,
      title,
      metaDescription,
      metaKeywords,
      h1,
      h2,
      h3,
      images,
      internalLinks: [...new Set(internalLinks)].slice(0, 100),
      externalLinks: [...new Set(externalLinks)].slice(0, 50),
      canonicalUrl,
      robots,
      ogTags,
      structuredData,
      wordCount,
      loadTimeMs,
      issues,
    };
  } catch (error) {
    const loadTimeMs = Math.round(performance.now() - startTime);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return {
      url,
      statusCode: 0,
      title: '',
      metaDescription: '',
      metaKeywords: '',
      h1: [],
      h2: [],
      h3: [],
      images: [],
      internalLinks: [],
      externalLinks: [],
      canonicalUrl: null,
      robots: null,
      ogTags: {},
      structuredData: [],
      wordCount: 0,
      loadTimeMs,
      issues: [`Failed to crawl: ${errorMessage}`],
    };
  }
}

export function formatCrawlResultForAgent(result: CrawlResult): string {
  const sections: string[] = [];

  sections.push(`## SEO Audit: ${result.url}`);
  sections.push(`**Status**: ${result.statusCode} | **Load Time**: ${result.loadTimeMs}ms | **Word Count**: ${result.wordCount}`);
  sections.push('');

  sections.push('### Page Metadata');
  sections.push(`- **Title** (${result.title.length} chars): ${result.title || '[MISSING]'}`);
  sections.push(`- **Meta Description** (${result.metaDescription.length} chars): ${result.metaDescription || '[MISSING]'}`);
  sections.push(`- **Canonical**: ${result.canonicalUrl || '[MISSING]'}`);
  sections.push(`- **Robots**: ${result.robots || '[Not specified]'}`);
  sections.push('');

  sections.push('### Heading Structure');
  sections.push(`- **H1** (${result.h1.length}): ${result.h1.join(', ') || '[MISSING]'}`);
  sections.push(`- **H2** (${result.h2.length}): ${result.h2.slice(0, 5).join(', ')}${result.h2.length > 5 ? '...' : ''}`);
  sections.push(`- **H3** (${result.h3.length}): ${result.h3.slice(0, 5).join(', ')}${result.h3.length > 5 ? '...' : ''}`);
  sections.push('');

  sections.push('### Images');
  sections.push(`- **Total**: ${result.images.length}`);
  const missingAlt = result.images.filter(img => !img.alt).length;
  if (missingAlt > 0) sections.push(`- **Missing alt text**: ${missingAlt} images`);
  sections.push('');

  sections.push('### Links');
  sections.push(`- **Internal Links**: ${result.internalLinks.length}`);
  sections.push(`- **External Links**: ${result.externalLinks.length}`);
  sections.push('');

  if (Object.keys(result.ogTags).length > 0) {
    sections.push('### Open Graph Tags');
    for (const [key, value] of Object.entries(result.ogTags)) {
      sections.push(`- **og:${key}**: ${value.slice(0, 100)}`);
    }
    sections.push('');
  }

  if (result.structuredData.length > 0) {
    sections.push(`### Structured Data: ${result.structuredData.length} JSON-LD blocks found`);
    sections.push('');
  }

  if (result.issues.length > 0) {
    sections.push('### Issues Found');
    for (const issue of result.issues) {
      sections.push(`- ${issue}`);
    }
  } else {
    sections.push('### No major issues detected');
  }

  return sections.join('\n');
}

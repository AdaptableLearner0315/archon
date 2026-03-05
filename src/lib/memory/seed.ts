/**
 * Memory Seeding from Onboarding
 *
 * Extracts atomic facts from onboarding profile and stores them as
 * company_memories across all 4 domains.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyMemoryInput, MemoryDomain } from '../types';
import { CognitiveMemoryStore } from './store';

interface OnboardingProfile {
  businessIdea?: string;
  businessIdeaSummary?: string;
  businessType?: 'saas' | 'creator' | 'services' | 'ecommerce';
  targetAudience?: { primary: string; painPoints?: string[] };
  competitors?: { name: string; strengths?: string[]; weaknesses?: string[]; weakness?: string }[];
  uniqueValueProp?: string;
  keyFeatures?: string[];
  brandTone?: 'professional' | 'casual' | 'playful' | 'technical';
  stage?: 'idea' | 'mvp' | 'launched' | 'revenue';
  teamSize?: number;
  founderSkills?: string[];
  hoursPerWeek?: number;
  riskTolerance?: 'low' | 'medium' | 'high';
  workingStyle?: 'move-fast' | 'balanced' | 'methodical';
}

interface SeedResult {
  total: number;
  byDomain: Record<MemoryDomain, number>;
  memories: CompanyMemoryInput[];
}

/**
 * Seed cognitive memories from an onboarding profile.
 * Extracts atomic facts and stores them across business_context, competitors, market, and agents domains.
 */
export async function seedMemoriesFromOnboarding(
  supabase: SupabaseClient,
  companyId: string,
  profile: OnboardingProfile
): Promise<SeedResult> {
  const store = new CognitiveMemoryStore(supabase);
  const memories: CompanyMemoryInput[] = [];

  // ===========================================================================
  // BUSINESS CONTEXT DOMAIN
  // ===========================================================================

  // Business Idea
  if (profile.businessIdea) {
    memories.push({
      companyId,
      domain: 'business_context',
      scope: '/business/idea',
      topic: 'Business Description',
      content: profile.businessIdea,
      importance: 0.95,
      confidence: 0.95,
      source: 'onboarding',
    });
  }

  // Business Summary
  if (profile.businessIdeaSummary) {
    memories.push({
      companyId,
      domain: 'business_context',
      scope: '/business/summary',
      topic: 'Business Summary',
      content: profile.businessIdeaSummary,
      importance: 0.9,
      confidence: 0.95,
      source: 'onboarding',
    });
  }

  // Business Type
  if (profile.businessType) {
    const typeDescriptions: Record<string, string> = {
      saas: 'Software as a Service (SaaS) - recurring subscription model with digital product delivery',
      creator: 'Creator Economy - content, courses, community, or audience monetization',
      services: 'Service Business - consulting, agency, or freelance work',
      ecommerce: 'E-commerce - physical or digital product sales',
    };

    memories.push({
      companyId,
      domain: 'business_context',
      scope: '/business/type',
      topic: 'Business Type',
      content: typeDescriptions[profile.businessType] || profile.businessType,
      importance: 0.85,
      confidence: 0.95,
      source: 'onboarding',
    });
  }

  // Stage
  if (profile.stage) {
    const stageDescriptions: Record<string, string> = {
      idea: 'Idea Stage - concept validation phase, no product yet',
      mvp: 'MVP Stage - minimum viable product, early testing',
      launched: 'Launched - product is live, acquiring users',
      revenue: 'Revenue Stage - generating income, focus on growth',
    };

    memories.push({
      companyId,
      domain: 'business_context',
      scope: '/business/stage',
      topic: 'Business Stage',
      content: stageDescriptions[profile.stage] || profile.stage,
      importance: 0.8,
      confidence: 0.95,
      source: 'onboarding',
    });
  }

  // Unique Value Proposition
  if (profile.uniqueValueProp) {
    memories.push({
      companyId,
      domain: 'business_context',
      scope: '/business/value_prop',
      topic: 'Unique Value Proposition',
      content: profile.uniqueValueProp,
      importance: 0.9,
      confidence: 0.9,
      source: 'onboarding',
    });
  }

  // Brand Tone
  if (profile.brandTone) {
    const toneDescriptions: Record<string, string> = {
      professional: 'Professional tone - formal, authoritative, enterprise-focused communication',
      casual: 'Casual tone - friendly, conversational, approachable communication',
      playful: 'Playful tone - fun, creative, engaging communication with personality',
      technical: 'Technical tone - precise, developer-focused, documentation-style communication',
    };

    memories.push({
      companyId,
      domain: 'business_context',
      scope: '/business/brand_tone',
      topic: 'Brand Tone',
      content: toneDescriptions[profile.brandTone] || profile.brandTone,
      importance: 0.7,
      confidence: 0.9,
      source: 'onboarding',
    });
  }

  // Key Features (each as separate memory)
  if (profile.keyFeatures && profile.keyFeatures.length > 0) {
    for (let i = 0; i < profile.keyFeatures.length; i++) {
      const feature = profile.keyFeatures[i];
      memories.push({
        companyId,
        domain: 'business_context',
        scope: `/business/features/${i + 1}`,
        topic: `Key Feature: ${feature}`,
        content: feature,
        importance: 0.7,
        confidence: 0.85,
        source: 'onboarding',
      });
    }
  }

  // Working Style
  if (profile.workingStyle) {
    const styleDescriptions: Record<string, string> = {
      'move-fast': 'Move Fast - aggressive execution, rapid iteration, bias toward action',
      balanced: 'Balanced - measured approach, careful planning with steady execution',
      methodical: 'Methodical - thorough research, detailed planning, risk-averse execution',
    };

    memories.push({
      companyId,
      domain: 'business_context',
      scope: '/business/working_style',
      topic: 'Working Style',
      content: styleDescriptions[profile.workingStyle] || profile.workingStyle,
      importance: 0.6,
      confidence: 0.9,
      source: 'onboarding',
    });
  }

  // Team Size
  if (profile.teamSize) {
    memories.push({
      companyId,
      domain: 'business_context',
      scope: '/business/team',
      topic: 'Team Size',
      content: `Team of ${profile.teamSize} person${profile.teamSize > 1 ? 's' : ''}`,
      importance: 0.5,
      confidence: 0.95,
      source: 'onboarding',
    });
  }

  // Founder Skills
  if (profile.founderSkills && profile.founderSkills.length > 0) {
    memories.push({
      companyId,
      domain: 'business_context',
      scope: '/business/founder_skills',
      topic: 'Founder Skills',
      content: `Founder expertise: ${profile.founderSkills.join(', ')}`,
      importance: 0.65,
      confidence: 0.9,
      source: 'onboarding',
    });
  }

  // ===========================================================================
  // MARKET DOMAIN
  // ===========================================================================

  // Target Audience
  if (profile.targetAudience?.primary) {
    memories.push({
      companyId,
      domain: 'market',
      scope: '/market/target_audience',
      topic: 'Primary Target Audience',
      content: profile.targetAudience.primary,
      importance: 0.9,
      confidence: 0.9,
      source: 'onboarding',
    });
  }

  // Pain Points (each as separate memory)
  if (profile.targetAudience?.painPoints && profile.targetAudience.painPoints.length > 0) {
    for (let i = 0; i < profile.targetAudience.painPoints.length; i++) {
      const painPoint = profile.targetAudience.painPoints[i];
      memories.push({
        companyId,
        domain: 'market',
        scope: `/market/pain_points/${i + 1}`,
        topic: `Customer Pain Point`,
        content: painPoint,
        importance: 0.8,
        confidence: 0.85,
        source: 'onboarding',
      });
    }
  }

  // Market opportunity (synthesized)
  if (profile.businessIdea && profile.targetAudience?.primary) {
    memories.push({
      companyId,
      domain: 'market',
      scope: '/market/opportunity',
      topic: 'Market Opportunity',
      content: `Building ${profile.businessIdeaSummary || 'a solution'} for ${profile.targetAudience.primary}. ${profile.stage === 'idea' ? 'Market validation needed.' : profile.stage === 'mvp' ? 'Early market testing.' : 'Active in market.'}`,
      importance: 0.75,
      confidence: 0.7,
      source: 'onboarding',
    });
  }

  // ===========================================================================
  // COMPETITORS DOMAIN
  // ===========================================================================

  if (profile.competitors && profile.competitors.length > 0) {
    for (const competitor of profile.competitors) {
      const competitorSlug = competitor.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');

      // Basic competitor info
      let content = `Competitor: ${competitor.name}`;

      // Add weaknesses
      const weaknesses: string[] = [];
      if (competitor.weakness) weaknesses.push(competitor.weakness);
      if (competitor.weaknesses) weaknesses.push(...competitor.weaknesses);

      if (weaknesses.length > 0) {
        content += `. Weaknesses: ${weaknesses.join('; ')}`;
      }

      // Add strengths
      if (competitor.strengths && competitor.strengths.length > 0) {
        content += `. Strengths: ${competitor.strengths.join('; ')}`;
      }

      memories.push({
        companyId,
        domain: 'competitors',
        scope: `/competitors/${competitorSlug}`,
        topic: competitor.name,
        content,
        importance: 0.8,
        confidence: 0.85,
        source: 'onboarding',
      });
    }
  }

  // ===========================================================================
  // AGENTS DOMAIN (Initial agent awareness)
  // ===========================================================================

  // Note about founder's AI organization
  memories.push({
    companyId,
    domain: 'agents',
    scope: '/agents/organization',
    topic: 'AI Organization Status',
    content: `AI organization initialized for ${profile.businessIdeaSummary || 'this business'}. All agents are aware of business context and ready to execute.`,
    importance: 0.6,
    confidence: 0.95,
    source: 'onboarding',
  });

  // ===========================================================================
  // STORE ALL MEMORIES
  // ===========================================================================

  const stored = await store.encodeBatch(memories);

  // Count by domain
  const byDomain: Record<MemoryDomain, number> = {
    business_context: 0,
    competitors: 0,
    market: 0,
    agents: 0,
  };

  for (const memory of stored) {
    byDomain[memory.domain]++;
  }

  return {
    total: stored.length,
    byDomain,
    memories,
  };
}

/**
 * Quick helper to seed memories from a "Surprise Me" generated concept
 */
export async function seedMemoriesFromSurprise(
  supabase: SupabaseClient,
  companyId: string,
  concept: {
    name: string;
    description: string;
    businessType: string;
    targetAudience: string;
    competitors?: { name: string; weakness: string }[];
    keyFeatures?: string[];
    uniqueValueProp?: string;
    brandTone?: string;
  }
): Promise<SeedResult> {
  // Convert surprise concept to OnboardingProfile format
  const profile: OnboardingProfile = {
    businessIdea: concept.description,
    businessIdeaSummary: concept.name,
    businessType: concept.businessType as OnboardingProfile['businessType'],
    targetAudience: { primary: concept.targetAudience },
    competitors: concept.competitors?.map((c) => ({ name: c.name, weakness: c.weakness })),
    keyFeatures: concept.keyFeatures,
    uniqueValueProp: concept.uniqueValueProp,
    brandTone: concept.brandTone as OnboardingProfile['brandTone'],
    stage: 'idea',
  };

  return seedMemoriesFromOnboarding(supabase, companyId, profile);
}

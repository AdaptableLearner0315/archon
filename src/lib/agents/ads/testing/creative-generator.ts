/**
 * Claude-powered UGC Ad Creative Generator
 * Generates multiple ad concepts with variations for A/B testing
 */

import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type ProductInfo,
  type Targeting,
  type GeneratedAdConcept,
  type AdCreative,
  type CreativeFormat,
  type CreativeContent,
  type AdCreativeRow,
  mapCreativeRowToModel,
} from './types';

const anthropic = new Anthropic();

const UGC_GENERATION_PROMPT = `You are an expert UGC (User Generated Content) ad creative strategist. Generate compelling ad concepts that feel authentic, native to social platforms, and drive conversions.

## Product Information
{product_info}

## Target Audience
{targeting_info}

## Requirements
- Generate {count} unique ad concepts
- Each concept should have a different angle/approach (e.g., problem-solution, social proof, curiosity, transformation, fear of missing out)
- Create {variations} variations for each concept (different hooks and CTAs)
- Formats needed: {formats}
- Durations: {durations}

## Ad Concept Guidelines
1. **Hook (first 2-3 seconds)**: Must stop the scroll. Use pattern interrupts, questions, bold statements, or relatable scenarios.
2. **Script**: Write naturally - as if a real person is talking to camera. Include pauses, natural language, and authenticity markers.
3. **CTA**: Clear, action-oriented, creates urgency without being pushy.
4. **Visual Direction**: Specific camera angles, lighting, settings that feel organic (not studio).

## Output Format
Return ONLY valid JSON in this exact structure:
{
  "concepts": [
    {
      "conceptId": "concept_1",
      "angle": "problem-solution",
      "tone": "conversational-excited",
      "hook": "Wait, you're still doing [pain point] the old way?",
      "script": "Full natural UGC script with [PAUSE], [SHOW PRODUCT], [GESTURE] markers...",
      "cta": "Click the link to try it free for 7 days",
      "visualDirection": "Phone-selfie style, natural lighting, casual home/outdoor setting, eye-contact with camera",
      "duration": "30",
      "musicSuggestion": "Upbeat trending TikTok sound or no music for authenticity",
      "variations": [
        {
          "type": "hook",
          "original": "Wait, you're still doing [pain point] the old way?",
          "variation": "POV: You just discovered [benefit]"
        },
        {
          "type": "cta",
          "original": "Click the link to try it free for 7 days",
          "variation": "Link in bio - only 100 spots left at this price"
        }
      ]
    }
  ]
}`;

export interface GenerateConceptsOptions {
  productInfo: ProductInfo;
  targeting?: Targeting;
  conceptCount: number;
  variationsPerConcept: number;
  formats: CreativeFormat[];
  durations: ('15' | '30' | '60')[];
}

export interface GenerationResult {
  concepts: GeneratedAdConcept[];
  tokensUsed: number;
  costUsd: number;
}

/**
 * Generate UGC ad concepts using Claude
 */
export async function generateAdConcepts(
  options: GenerateConceptsOptions
): Promise<GenerationResult> {
  const {
    productInfo,
    targeting,
    conceptCount,
    variationsPerConcept,
    formats,
    durations,
  } = options;

  const productInfoText = `
Product Name: ${productInfo.name}
Description: ${productInfo.description}
Price: ${productInfo.price}
Key Benefits:
${productInfo.benefits.map((b) => `- ${b}`).join('\n')}
Unique Selling Points:
${productInfo.unique_selling_points.map((u) => `- ${u}`).join('\n')}
Target Audience: ${productInfo.target_audience}
Brand Voice: ${productInfo.brand_voice}
`;

  const targetingText = targeting
    ? `
Age Range: ${targeting.age_min || 18} - ${targeting.age_max || 65}
Genders: ${targeting.genders?.join(', ') || 'All'}
Locations: ${targeting.locations?.join(', ') || 'Global'}
Interests: ${targeting.interests?.join(', ') || 'Broad targeting'}
`
    : 'Broad targeting based on product fit';

  const prompt = UGC_GENERATION_PROMPT
    .replace('{product_info}', productInfoText)
    .replace('{targeting_info}', targetingText)
    .replace('{count}', String(conceptCount))
    .replace('{variations}', String(variationsPerConcept))
    .replace('{formats}', formats.join(', '))
    .replace('{durations}', durations.join('s, ') + 's');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const textContent = response.content.find((c) => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  // Parse the JSON response
  const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not parse JSON from Claude response');
  }

  const parsed = JSON.parse(jsonMatch[0]) as { concepts: GeneratedAdConcept[] };

  // Calculate cost (Claude Sonnet pricing)
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const costUsd = (inputTokens * 0.003 + outputTokens * 0.015) / 1000;

  return {
    concepts: parsed.concepts,
    tokensUsed: inputTokens + outputTokens,
    costUsd,
  };
}

/**
 * Generate additional variations for an existing concept
 */
export async function generateVariations(
  concept: GeneratedAdConcept,
  variationCount: number,
  variationTypes: ('hook' | 'cta' | 'angle')[]
): Promise<GeneratedAdConcept['variations']> {
  const prompt = `Generate ${variationCount} new variations for this ad concept.

Original Concept:
Hook: ${concept.hook}
Script: ${concept.script}
CTA: ${concept.cta}
Angle: ${concept.angle}

Generate variations for: ${variationTypes.join(', ')}

Return ONLY valid JSON:
{
  "variations": [
    { "type": "hook|cta|angle", "original": "...", "variation": "..." }
  ]
}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const textContent = response.content.find((c) => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not parse JSON from Claude response');
  }

  const parsed = JSON.parse(jsonMatch[0]) as { variations: GeneratedAdConcept['variations'] };
  return parsed.variations;
}

/**
 * Save generated concepts to database as ad_creatives
 */
export async function saveConceptsToDatabase(
  companyId: string,
  campaignId: string,
  concepts: GeneratedAdConcept[],
  formats: CreativeFormat[],
  supabase: SupabaseClient
): Promise<AdCreative[]> {
  const creativesToInsert: {
    company_id: string;
    campaign_id: string;
    concept_id: string;
    variation_number: number;
    creative_type: string;
    content: CreativeContent;
    format: CreativeFormat;
    status: string;
  }[] = [];

  for (const concept of concepts) {
    // Insert base concept
    for (const format of formats) {
      creativesToInsert.push({
        company_id: companyId,
        campaign_id: campaignId,
        concept_id: concept.conceptId,
        variation_number: 1,
        creative_type: 'ugc_script',
        content: {
          hook: concept.hook,
          script: concept.script,
          cta: concept.cta,
          visual_direction: concept.visualDirection,
          duration: concept.duration,
          angle: concept.angle,
          tone: concept.tone,
          music_suggestion: concept.musicSuggestion,
        },
        format,
        status: 'pending',
      });

      // Insert variations
      let variationNum = 2;
      for (const variation of concept.variations || []) {
        const variantContent: CreativeContent = {
          hook: variation.type === 'hook' ? variation.variation : concept.hook,
          script: concept.script,
          cta: variation.type === 'cta' ? variation.variation : concept.cta,
          visual_direction: concept.visualDirection,
          duration: concept.duration,
          angle: variation.type === 'angle' ? variation.variation : concept.angle,
          tone: concept.tone,
          music_suggestion: concept.musicSuggestion,
        };

        creativesToInsert.push({
          company_id: companyId,
          campaign_id: campaignId,
          concept_id: concept.conceptId,
          variation_number: variationNum++,
          creative_type: 'ugc_script',
          content: variantContent,
          format,
          status: 'pending',
        });
      }
    }
  }

  const { data, error } = await supabase
    .from('ad_creatives')
    .insert(creativesToInsert)
    .select();

  if (error) {
    throw new Error(`Failed to save creatives: ${error.message}`);
  }

  return (data as AdCreativeRow[]).map(mapCreativeRowToModel);
}

/**
 * Get pending creatives for a campaign
 */
export async function getPendingCreatives(
  campaignId: string,
  supabase: SupabaseClient
): Promise<AdCreative[]> {
  const { data, error } = await supabase
    .from('ad_creatives')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('status', 'pending')
    .order('concept_id')
    .order('variation_number');

  if (error) {
    throw new Error(`Failed to fetch creatives: ${error.message}`);
  }

  return (data as AdCreativeRow[]).map(mapCreativeRowToModel);
}

/**
 * Approve creatives for publishing
 */
export async function approveCreatives(
  creativeIds: string[],
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase
    .from('ad_creatives')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .in('id', creativeIds);

  if (error) {
    throw new Error(`Failed to approve creatives: ${error.message}`);
  }
}

/**
 * Reject creatives with reason
 */
export async function rejectCreatives(
  creativeIds: string[],
  reason: string,
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase
    .from('ad_creatives')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .in('id', creativeIds);

  if (error) {
    throw new Error(`Failed to reject creatives: ${error.message}`);
  }
}

/**
 * Auto-approve all pending creatives for a campaign
 */
export async function autoApproveAllCreatives(
  campaignId: string,
  supabase: SupabaseClient
): Promise<number> {
  const { data, error } = await supabase
    .from('ad_creatives')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('campaign_id', campaignId)
    .eq('status', 'pending')
    .select('id');

  if (error) {
    throw new Error(`Failed to auto-approve creatives: ${error.message}`);
  }

  return data?.length || 0;
}

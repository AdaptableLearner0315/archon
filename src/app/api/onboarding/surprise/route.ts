/**
 * Surprise Me API
 *
 * POST /api/onboarding/surprise
 * Uses Claude to generate a random, creative business concept.
 * Does NOT create the company yet — returns the concept for user review.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

const SURPRISE_PROMPT = `You are a creative business idea generator. Generate a random, exciting, and viable business concept.

Return a JSON object with these fields:

{
  "companyName": "A short, brandable 1-3 word company name",
  "businessDescription": "2-3 sentence description of the business",
  "businessType": "saas | creator | services | ecommerce",
  "targetAudience": {
    "primary": "Who this serves",
    "painPoints": ["Pain point 1", "Pain point 2"]
  },
  "competitors": [
    {"name": "Competitor 1", "weakness": "Why this idea beats them"}
  ],
  "keyFeatures": ["Feature 1", "Feature 2", "Feature 3"],
  "uniqueValueProp": "One sentence value proposition",
  "brandTone": "professional | casual | playful | technical"
}

Guidelines:
- Be creative and diverse — pick from different industries each time
- The business should feel modern and achievable for a solo founder
- Company name should be catchy and memorable (think: Stripe, Notion, Figma)
- Include realistic competitors
- Make it exciting enough that someone would want to build it

Return ONLY the JSON object, nothing else.`;

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: SURPRISE_PROMPT,
        },
      ],
    });

    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return NextResponse.json(
        { error: 'Failed to generate business concept' },
        { status: 500 }
      );
    }

    const concept = JSON.parse(jsonMatch[0]);

    return NextResponse.json({ concept });
  } catch (error) {
    console.error('Surprise Me error:', error);
    return NextResponse.json(
      { error: 'Failed to generate business concept' },
      { status: 500 }
    );
  }
}

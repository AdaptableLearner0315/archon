import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ATLAS_EXTRACTION_PROMPT } from '@/lib/onboarding/atlas-prompt';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

interface ExtractRequest {
  conversationHistory: { role: string; content: string }[];
}

export interface ExtractedProfile {
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

/**
 * Extract profile from conversation without completing onboarding.
 * Used for the profile review step before final submission.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: ExtractRequest = await request.json();
    const { conversationHistory } = body;

    if (!conversationHistory || conversationHistory.length === 0) {
      return NextResponse.json({ error: 'No conversation provided' }, { status: 400 });
    }

    const profile = await extractProfileFromConversation(conversationHistory);

    return NextResponse.json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error('Profile extraction error:', error);
    return NextResponse.json(
      { error: 'Failed to extract profile' },
      { status: 500 }
    );
  }
}

async function extractProfileFromConversation(
  conversation: { role: string; content: string }[]
): Promise<ExtractedProfile> {
  try {
    const conversationText = conversation
      .map((m) => `${m.role === 'user' ? 'Founder' : 'Atlas'}: ${m.content}`)
      .join('\n\n');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: `${ATLAS_EXTRACTION_PROMPT}\n\nConversation:\n${conversationText}`,
        },
      ],
    });

    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const extracted = JSON.parse(jsonMatch[0]);

      return {
        businessIdea: extracted.businessDescription || '',
        businessIdeaSummary: extracted.businessSummary || '',
        businessType: extracted.businessType || 'saas',
        targetAudience: extracted.targetAudience || undefined,
        competitors: extracted.competitors || undefined,
        uniqueValueProp: extracted.uniqueValueProp || undefined,
        keyFeatures: extracted.keyFeatures || undefined,
        brandTone: extracted.brandTone || 'casual',
        stage: extracted.stage || 'idea',
        teamSize: 1,
        workingStyle: 'balanced',
        founderSkills: extracted.founderBackground ? [extracted.founderBackground] : undefined,
      };
    }
  } catch (error) {
    console.error('Claude extraction failed, falling back to keyword-based:', error);
  }

  // Fallback: keyword-based extraction
  return extractProfileKeywordBased(conversation);
}

function extractProfileKeywordBased(
  conversation: { role: string; content: string }[]
): ExtractedProfile {
  const userMessages = conversation
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join(' ');

  const lowerContent = userMessages.toLowerCase();

  const profile: ExtractedProfile = {
    businessIdea: userMessages.slice(0, 200),
    businessIdeaSummary: userMessages.split(' ').slice(0, 5).join(' '),
    stage: 'idea',
    teamSize: 1,
  };

  if (lowerContent.includes('content') || lowerContent.includes('creator') || lowerContent.includes('course') || lowerContent.includes('newsletter')) {
    profile.businessType = 'creator';
  } else if (lowerContent.includes('agency') || lowerContent.includes('consulting') || lowerContent.includes('freelance') || lowerContent.includes('service') || lowerContent.includes('client')) {
    profile.businessType = 'services';
  } else if (lowerContent.includes('shop') || lowerContent.includes('store') || lowerContent.includes('product') || lowerContent.includes('ecommerce') || lowerContent.includes('inventory')) {
    profile.businessType = 'ecommerce';
  } else {
    profile.businessType = 'saas';
  }

  if (lowerContent.includes('revenue') || lowerContent.includes('paying customer')) {
    profile.stage = 'revenue';
  } else if (lowerContent.includes('launched') || lowerContent.includes('live')) {
    profile.stage = 'launched';
  } else if (lowerContent.includes('mvp') || lowerContent.includes('prototype')) {
    profile.stage = 'mvp';
  }

  if (lowerContent.includes('fast') || lowerContent.includes('aggressive')) {
    profile.workingStyle = 'move-fast';
  } else if (lowerContent.includes('careful') || lowerContent.includes('methodical')) {
    profile.workingStyle = 'methodical';
  } else {
    profile.workingStyle = 'balanced';
  }

  if (lowerContent.includes('enterprise') || lowerContent.includes('b2b') || lowerContent.includes('professional')) {
    profile.brandTone = 'professional';
  } else if (lowerContent.includes('fun') || lowerContent.includes('game') || lowerContent.includes('social')) {
    profile.brandTone = 'playful';
  } else if (lowerContent.includes('developer') || lowerContent.includes('api') || lowerContent.includes('technical')) {
    profile.brandTone = 'technical';
  } else {
    profile.brandTone = 'casual';
  }

  const keyFeatures: string[] = [];
  if (lowerContent.includes('automat')) keyFeatures.push('Automation');
  if (lowerContent.includes('ai') || lowerContent.includes('intelligent')) keyFeatures.push('AI-Powered');
  if (lowerContent.includes('analytic') || lowerContent.includes('insight')) keyFeatures.push('Analytics');
  if (lowerContent.includes('collaborat') || lowerContent.includes('team')) keyFeatures.push('Collaboration');
  if (lowerContent.includes('integrat')) keyFeatures.push('Integrations');
  if (keyFeatures.length > 0) {
    profile.keyFeatures = keyFeatures;
  }

  return profile;
}

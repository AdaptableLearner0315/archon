import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import {
  createConversationEngine,
  type ConversationPhase,
  type OnboardingProfile,
} from '@/lib/onboarding/conversation-engine';
import { buildOnboardingPrompt, ATLAS_EXTRACTION_PROMPT } from '@/lib/onboarding/atlas-prompt';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

interface MemoryInsight {
  id: string;
  category: 'business' | 'market' | 'stage' | 'audience' | 'pain';
  label: string;
  value: string;
}

/**
 * Build a list of captured insights from extracted profile data.
 */
function buildInsightsList(data: Partial<OnboardingProfile>): MemoryInsight[] {
  const insights: MemoryInsight[] = [];

  if (data.businessDescription) {
    insights.push({
      id: 'business_desc',
      category: 'business',
      label: 'Business',
      value: truncate(data.businessDescription, 50),
    });
  }

  if (data.businessSummary) {
    insights.push({
      id: 'business_summary',
      category: 'business',
      label: 'Name',
      value: data.businessSummary,
    });
  }

  if (data.biggestPainPoint) {
    insights.push({
      id: 'pain_point',
      category: 'pain',
      label: 'Challenge',
      value: truncate(data.biggestPainPoint, 40),
    });
  }

  if (data.targetAudience?.primary) {
    insights.push({
      id: 'audience',
      category: 'audience',
      label: 'Audience',
      value: truncate(data.targetAudience.primary, 30),
    });
  }

  if (data.stage) {
    const stageLabels: Record<string, string> = {
      idea: 'Idea Stage',
      mvp: 'MVP',
      launched: 'Launched',
      revenue: 'Revenue',
    };
    insights.push({
      id: 'stage',
      category: 'stage',
      label: 'Stage',
      value: stageLabels[data.stage] || data.stage,
    });
  }

  return insights;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Strip all internal markers from response text before displaying to user.
 */
function stripMarkers(text: string): string {
  return text
    .replace(/\[COMPLETE\]/g, '')
    .replace(/\[INSIGHT:[^\]]*\]/g, '')
    .replace(/\[CREDITS:[^\]]*\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, phase, conversationHistory, currentProgress = 0 } = body as {
      message: string;
      phase: ConversationPhase;
      conversationHistory: { role: 'user' | 'assistant'; content: string }[];
      currentProgress?: number;
    };

    // Count user messages for state tracking
    const userMessageCount = conversationHistory.filter(
      (m: { role: string }) => m.role === 'user'
    ).length;

    // Initialize conversation engine with current state
    const engine = createConversationEngine({
      phase,
      messageCount: userMessageCount,
      progress: currentProgress,
    });

    // Build the prompt for Atlas
    const phaseGuidance = engine.getPhaseGuidance();
    const systemPrompt = buildOnboardingPrompt(phaseGuidance, conversationHistory);

    // Create readable stream for SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Stream Atlas's response
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 512,
            system: systemPrompt,
            messages: [
              ...conversationHistory.map((m) => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
              })),
              { role: 'user', content: message },
            ],
            stream: true,
          });

          let fullResponse = '';

          for await (const event of response) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              const text = event.delta.text;
              fullResponse += text;

              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`)
              );
            }
          }

          // Send the clean response
          const cleanResponse = stripMarkers(fullResponse);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'clean_response', content: cleanResponse })}\n\n`)
          );

          // Extract data from conversation
          const { extractedData, userIndicatedDone } = await extractProfileData(
            [...conversationHistory, { role: 'user', content: message }, { role: 'assistant', content: cleanResponse }]
          );

          // Process message and get new state
          const { newPhase, progress, isComplete } = engine.processMessage(
            extractedData,
            userIndicatedDone || fullResponse.includes('[COMPLETE]')
          );

          // Send progress update
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'progress', progress })}\n\n`)
          );

          // Send phase update
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'phase', phase: newPhase })}\n\n`)
          );

          // Send captured insights for memory feedback UI
          const insights = buildInsightsList(extractedData);
          if (insights.length > 0) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'insights', insights })}\n\n`)
            );
          }

          // Handle completion
          if (isComplete) {
            const finalProfile = engine.getExtractedData();
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'complete', profile: finalProfile })}\n\n`)
            );
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('Streaming error:', error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'error', message: 'Failed to generate response' })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Onboarding chat error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function extractProfileData(
  conversation: { role: 'user' | 'assistant'; content: string }[]
): Promise<{ extractedData: Partial<OnboardingProfile>; userIndicatedDone: boolean }> {
  try {
    const conversationText = conversation
      .map((m) => `${m.role === 'user' ? 'Founder' : 'Atlas'}: ${m.content}`)
      .join('\n\n');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: ATLAS_EXTRACTION_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Extract data from this conversation:\n\n${conversationText}`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        extractedData: {
          businessDescription: parsed.businessDescription || '',
          biggestPainPoint: parsed.biggestPainPoint || '',
          businessSummary: parsed.businessSummary,
          targetAudience: parsed.targetAudience,
          stage: parsed.stage,
          founderBackground: parsed.founderBackground,
        },
        userIndicatedDone: parsed.userIndicatedDone || false,
      };
    }
  } catch (error) {
    console.error('Profile extraction error:', error);
  }

  return { extractedData: {}, userIndicatedDone: false };
}

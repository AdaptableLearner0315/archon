/**
 * Infrastructure Generation API
 *
 * POST /api/infrastructure/generate
 * Triggers infrastructure generation for a company.
 * Streams progress via SSE.
 */

import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  generateInfrastructure,
  extractInfrastructureContext,
  type InfraStreamEvent,
} from '@/lib/infrastructure';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max

interface GenerateRequest {
  companyId: string;
  profile?: Record<string, unknown>;
  conversationHistory?: { role: string; content: string }[];
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: InfraStreamEvent) => {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(data));
      };

      try {
        // Auth check
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
          sendEvent({
            type: 'job_failed',
            jobId: '',
            error: 'Unauthorized',
            timestamp: new Date().toISOString(),
          });
          controller.close();
          return;
        }

        // Parse request
        const body: GenerateRequest = await request.json();
        const { companyId, profile, conversationHistory } = body;

        if (!companyId) {
          sendEvent({
            type: 'job_failed',
            jobId: '',
            error: 'Company ID is required',
            timestamp: new Date().toISOString(),
          });
          controller.close();
          return;
        }

        // Verify company ownership
        const { data: company, error: companyError } = await supabase
          .from('companies')
          .select('id, user_id')
          .eq('id', companyId)
          .single();

        if (companyError || !company || company.user_id !== user.id) {
          sendEvent({
            type: 'job_failed',
            jobId: '',
            error: 'Company not found or unauthorized',
            timestamp: new Date().toISOString(),
          });
          controller.close();
          return;
        }

        // Get profile if not provided
        let finalProfile = profile;
        if (!finalProfile) {
          const { data: onboardingProfile } = await supabase
            .from('onboarding_profiles')
            .select('*')
            .eq('company_id', companyId)
            .single();

          if (onboardingProfile) {
            finalProfile = {
              business_idea: onboardingProfile.business_idea,
              business_idea_summary: onboardingProfile.business_idea_summary,
              target_audience: onboardingProfile.target_audience,
              competitors: onboardingProfile.competitors,
              unique_value_prop: onboardingProfile.unique_value_prop,
              stage: onboardingProfile.stage,
            };
          }
        }

        if (!finalProfile) {
          sendEvent({
            type: 'job_failed',
            jobId: '',
            error: 'No profile data available. Please complete onboarding first.',
            timestamp: new Date().toISOString(),
          });
          controller.close();
          return;
        }

        // Extract infrastructure context
        const context = extractInfrastructureContext(
          finalProfile,
          conversationHistory || []
        );

        // Run infrastructure generation
        const job = await generateInfrastructure({
          supabase,
          companyId,
          context,
          onProgress: sendEvent,
        });

        // Send final completion event
        sendEvent({
          type: 'job_completed',
          jobId: job.id,
          progress: 100,
          message: 'Infrastructure generation complete!',
          timestamp: new Date().toISOString(),
        });

        controller.close();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        sendEvent({
          type: 'job_failed',
          jobId: '',
          error: errorMessage,
          timestamp: new Date().toISOString(),
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

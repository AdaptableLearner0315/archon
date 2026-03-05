import { NextRequest } from 'next/server';
import {
  getPlatformMetrics,
  generateActivityEvent,
  generateEvolutionEvent,
  adjustMetrics
} from '@/lib/activity/aggregateMetrics';
import type { PlatformMetrics, ActivityStreamEvent } from '@/types/activity';

/**
 * SSE endpoint for "The Breath" landing page activity visualization.
 *
 * This is a PUBLIC endpoint (no auth required) since landing page visitors
 * aren't logged in. It streams aggregate platform metrics and activity.
 *
 * Event schedule:
 * - On connect: Initial metrics
 * - Every 3 seconds: New activity events
 * - Every 30 seconds: Updated metrics
 * - Every 15 seconds: Keepalive
 * - Occasionally (~2-3x per day): Evolution events
 */
export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  // Track current metrics state for incremental updates
  let currentMetrics: PlatformMetrics | null = null;

  // Track evolution event timing (rare events)
  let lastEvolutionTime = Date.now();
  const EVOLUTION_INTERVAL_MIN = 4 * 60 * 60 * 1000; // 4 hours minimum between evolutions
  const EVOLUTION_CHANCE = 0.001; // 0.1% chance per activity tick

  const stream = new ReadableStream({
    async start(controller) {
      /**
       * Helper to send SSE event
       */
      function sendEvent(event: ActivityStreamEvent) {
        try {
          const data = JSON.stringify(event);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          // Controller may be closed
        }
      }

      /**
       * Send keepalive comment (not a data event)
       */
      function sendKeepalive() {
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          // Controller may be closed
        }
      }

      // Send initial connection event
      sendEvent({ type: 'connected' });

      // Fetch and send initial metrics
      try {
        currentMetrics = await getPlatformMetrics();
        sendEvent({ type: 'metrics', data: currentMetrics });
      } catch (error) {
        console.error('Error fetching initial metrics:', error);
        // Send fallback metrics
        currentMetrics = {
          companiesRunning: 2547,
          hoursSaved: 12384,
          decisionsToday: 892341,
          activeAgents: 247,
          crossTeamHandoffs: 1423,
          alignmentScore: 95
        };
        sendEvent({ type: 'metrics', data: currentMetrics });
      }

      // Activity interval: Every 3 seconds
      const activityInterval = setInterval(() => {
        // Generate and send a new activity event
        const activity = generateActivityEvent();
        sendEvent({ type: 'activity', data: activity });

        // Small chance of evolution event (if enough time has passed)
        const timeSinceLastEvolution = Date.now() - lastEvolutionTime;
        if (
          timeSinceLastEvolution > EVOLUTION_INTERVAL_MIN &&
          Math.random() < EVOLUTION_CHANCE
        ) {
          const evolution = generateEvolutionEvent();
          sendEvent({ type: 'evolution', data: evolution });
          lastEvolutionTime = Date.now();
        }
      }, 3000);

      // Metrics update interval: Every 30 seconds
      const metricsInterval = setInterval(() => {
        if (currentMetrics) {
          currentMetrics = adjustMetrics(currentMetrics);
          sendEvent({ type: 'metrics', data: currentMetrics });
        }
      }, 30000);

      // Keepalive interval: Every 15 seconds
      const keepaliveInterval = setInterval(() => {
        sendKeepalive();
      }, 15000);

      // Cleanup on abort (client disconnect)
      request.signal.addEventListener('abort', () => {
        clearInterval(activityInterval);
        clearInterval(metricsInterval);
        clearInterval(keepaliveInterval);
        try {
          controller.close();
        } catch {
          // May already be closed
        }
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    }
  });
}

// Disable static generation for this route
export const dynamic = 'force-dynamic';

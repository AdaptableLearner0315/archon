'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  PlatformMetrics,
  ActivityEvent,
  EvolutionEvent,
  ActivityStreamEvent
} from '@/types/activity';
import {
  isPlatformMetrics,
  isActivityEvent,
  isEvolutionEvent
} from '@/types/activity';

/**
 * Configuration options for the activity stream hook.
 */
interface UseActivityStreamOptions {
  /** Maximum number of activity events to keep in memory */
  maxActivityEvents?: number;
  /** Enable automatic reconnection on disconnect */
  autoReconnect?: boolean;
  /** Delay before reconnection attempt (ms) */
  reconnectDelay?: number;
  /** Maximum reconnection attempts before giving up */
  maxReconnectAttempts?: number;
}

/**
 * Return type for the useActivityStream hook.
 */
interface UseActivityStreamReturn {
  /** Current platform metrics (null until first data received) */
  metrics: PlatformMetrics | null;
  /** Recent activity events (newest first) */
  recentActivity: ActivityEvent[];
  /** Most recent evolution event (null if none yet) */
  lastEvolution: EvolutionEvent | null;
  /** Whether the SSE connection is established */
  connected: boolean;
  /** Any connection error message */
  error: string | null;
  /** Manually reconnect the stream */
  reconnect: () => void;
  /** Manually disconnect the stream */
  disconnect: () => void;
}

/**
 * Custom hook for consuming the activity stream SSE endpoint.
 * Used by "The Breath" landing page visualization component.
 *
 * @param options - Configuration options
 * @returns Stream state and control functions
 *
 * @example
 * ```tsx
 * const { metrics, recentActivity, connected } = useActivityStream();
 *
 * if (!connected) return <LoadingSpinner />;
 *
 * return (
 *   <div>
 *     <CenterStat value={metrics?.companiesRunning} />
 *     <ActivityFeed events={recentActivity} />
 *   </div>
 * );
 * ```
 */
export function useActivityStream(
  options: UseActivityStreamOptions = {}
): UseActivityStreamReturn {
  const {
    maxActivityEvents = 50,
    autoReconnect = true,
    reconnectDelay = 3000,
    maxReconnectAttempts = 5
  } = options;

  // State
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [recentActivity, setRecentActivity] = useState<ActivityEvent[]>([]);
  const [lastEvolution, setLastEvolution] = useState<EvolutionEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for cleanup and reconnection logic
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isManualDisconnectRef = useRef(false);

  /**
   * Handle incoming SSE message
   */
  const handleMessage = useCallback(
    (e: MessageEvent) => {
      try {
        const event: ActivityStreamEvent = JSON.parse(e.data);

        switch (event.type) {
          case 'connected':
            setConnected(true);
            setError(null);
            reconnectAttemptsRef.current = 0;
            break;

          case 'metrics':
            if (event.data && isPlatformMetrics(event.data)) {
              setMetrics(event.data);
            }
            break;

          case 'activity':
            if (event.data && isActivityEvent(event.data)) {
              // Parse timestamp if it's a string
              const activityEvent: ActivityEvent = {
                ...event.data,
                timestamp:
                  typeof event.data.timestamp === 'string'
                    ? new Date(event.data.timestamp)
                    : event.data.timestamp
              };

              setRecentActivity((prev) => {
                // Add new event at the beginning, keep only maxActivityEvents
                const updated = [activityEvent, ...prev];
                return updated.slice(0, maxActivityEvents);
              });
            }
            break;

          case 'evolution':
            if (event.data && isEvolutionEvent(event.data)) {
              // Parse timestamp if it's a string
              const evolutionEvent: EvolutionEvent = {
                ...event.data,
                timestamp:
                  typeof event.data.timestamp === 'string'
                    ? new Date(event.data.timestamp)
                    : event.data.timestamp
              };
              setLastEvolution(evolutionEvent);
            }
            break;

          case 'keepalive':
            // Just a heartbeat, no action needed
            break;

          default:
            // Unknown event type, ignore
            break;
        }
      } catch (parseError) {
        console.error('Error parsing SSE event:', parseError);
      }
    },
    [maxActivityEvents]
  );

  /**
   * Handle connection error
   */
  const handleError = useCallback(() => {
    setConnected(false);

    // Don't attempt reconnect if manually disconnected
    if (isManualDisconnectRef.current) {
      return;
    }

    // Check if we should attempt reconnection
    if (
      autoReconnect &&
      reconnectAttemptsRef.current < maxReconnectAttempts
    ) {
      reconnectAttemptsRef.current += 1;
      setError(
        `Connection lost. Reconnecting (${reconnectAttemptsRef.current}/${maxReconnectAttempts})...`
      );

      // Clear any existing reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      // Schedule reconnection
      reconnectTimeoutRef.current = setTimeout(() => {
        if (!isManualDisconnectRef.current) {
          connect();
        }
      }, reconnectDelay);
    } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      setError('Connection failed. Please refresh the page to try again.');
    }
  }, [autoReconnect, maxReconnectAttempts, reconnectDelay]);

  /**
   * Establish SSE connection
   */
  const connect = useCallback(() => {
    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    isManualDisconnectRef.current = false;

    try {
      const eventSource = new EventSource('/api/activity/stream');
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setConnected(true);
        setError(null);
      };

      eventSource.onmessage = handleMessage;

      eventSource.onerror = handleError;
    } catch (connectionError) {
      console.error('Error creating EventSource:', connectionError);
      setError('Failed to connect to activity stream.');
      handleError();
    }
  }, [handleMessage, handleError]);

  /**
   * Manual reconnect function
   */
  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    isManualDisconnectRef.current = false;
    connect();
  }, [connect]);

  /**
   * Manual disconnect function
   */
  const disconnect = useCallback(() => {
    isManualDisconnectRef.current = true;

    // Clear reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setConnected(false);
    setError(null);
  }, []);

  // Connect on mount, cleanup on unmount
  useEffect(() => {
    connect();

    return () => {
      // Cleanup on unmount
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [connect]);

  return {
    metrics,
    recentActivity,
    lastEvolution,
    connected,
    error,
    reconnect,
    disconnect
  };
}

export default useActivityStream;

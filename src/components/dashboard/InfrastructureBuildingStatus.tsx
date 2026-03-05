'use client';

/**
 * Infrastructure Building Status Bar
 *
 * Shown inline at the top of the dashboard when infrastructure is being generated.
 * Consumes SSE events and shows rolling status text.
 * Auto-dismisses on completion.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, CheckCircle2 } from 'lucide-react';
import type { InfraStreamEvent } from '@/lib/infrastructure';

interface InfrastructureBuildingStatusProps {
  companyId: string;
  onComplete: () => void;
}

const ROLLING_MESSAGES = [
  'Generating landing page...',
  'Setting up email templates...',
  'Creating database schema...',
  'Building social strategy...',
  'Configuring server...',
  'Writing help center...',
  'Analyzing competitors...',
  'Designing growth experiments...',
];

export function InfrastructureBuildingStatus({
  companyId,
  onComplete,
}: InfrastructureBuildingStatusProps) {
  const [currentMessage, setCurrentMessage] = useState(ROLLING_MESSAGES[0]);
  const [messageIndex, setMessageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null);
  const startedRef = useRef(false);

  // Cycle through rolling messages
  useEffect(() => {
    if (isComplete) return;

    const interval = setInterval(() => {
      setMessageIndex((prev) => {
        const next = (prev + 1) % ROLLING_MESSAGES.length;
        setCurrentMessage(ROLLING_MESSAGES[next]);
        return next;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [isComplete]);

  const startGeneration = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;

    try {
      const response = await fetch('/api/infrastructure/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      });

      if (!response.ok) {
        setError('Failed to start infrastructure generation');
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) return;
      readerRef.current = reader;

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event: InfraStreamEvent = JSON.parse(line.slice(6));

              if (event.type === 'task_started' && event.message) {
                setCurrentMessage(event.message);
              } else if (event.type === 'task_completed') {
                setProgress((prev) => Math.min(prev + 12.5, 95));
              } else if (event.type === 'job_completed') {
                setProgress(100);
                setIsComplete(true);
                setCurrentMessage('All done!');
                setTimeout(onComplete, 1500);
              } else if (event.type === 'job_failed') {
                setError(event.error || 'Generation failed');
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (err) {
      console.error('Infrastructure generation error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [companyId, onComplete]);

  useEffect(() => {
    startGeneration();

    return () => {
      if (readerRef.current) {
        readerRef.current.cancel().catch(() => {});
      }
    };
  }, [startGeneration]);

  if (error) {
    return (
      <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
        <p className="text-sm text-red-400">
          Infrastructure generation encountered an issue: {error}
        </p>
        <p className="text-xs text-white/40 mt-1">
          Your dashboard is still functional. You can retry from settings.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="mb-6 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]"
    >
      <div className="flex items-center gap-3 mb-3">
        {isComplete ? (
          <CheckCircle2 className="w-5 h-5 text-white flex-shrink-0" />
        ) : (
          <Loader2 className="w-5 h-5 text-white/60 animate-spin flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">
            {isComplete ? 'Infrastructure Ready' : 'AI Team Building in Progress'}
          </p>
          <AnimatePresence mode="wait">
            <motion.p
              key={currentMessage}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="text-xs text-white/40 mt-0.5"
            >
              {currentMessage}
            </motion.p>
          </AnimatePresence>
        </div>
        <span className="text-xs text-white/30 flex-shrink-0">{Math.round(progress)}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-white"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
    </motion.div>
  );
}

'use client';

/**
 * Infrastructure Progress Component
 *
 * Shows animated progress visualization during infrastructure generation.
 * Displays agents working on each component with real-time updates.
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layout,
  Server,
  Database,
  Mail,
  Twitter,
  HelpCircle,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import type { InfraStreamEvent, InfrastructureAssetType } from '@/lib/infrastructure';

interface InfrastructureProgressProps {
  companyId: string;
  profile?: Record<string, unknown>;
  onComplete: () => void;
  onError?: (error: string) => void;
}

interface ComponentStatus {
  type: InfrastructureAssetType;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  progress: number;
  agent?: string;
}

const COMPONENT_INFO: Record<InfrastructureAssetType, { name: string; icon: typeof Layout; description: string }> = {
  landing: {
    name: 'Landing Page',
    icon: Layout,
    description: 'Conversion-optimized homepage',
  },
  server: {
    name: 'Server Config',
    icon: Server,
    description: 'Production deployment setup',
  },
  database: {
    name: 'Database Schema',
    icon: Database,
    description: 'Business-specific data model',
  },
  email: {
    name: 'Email Templates',
    icon: Mail,
    description: 'Welcome & transactional emails',
  },
  social: {
    name: 'Social Strategy',
    icon: Twitter,
    description: 'Content calendar & growth plan',
  },
  faqs: {
    name: 'Help Center',
    icon: HelpCircle,
    description: 'Initial FAQ & support docs',
  },
};

const AGENT_NAMES: Record<string, string> = {
  marketing: 'Echo',
  product: 'Prism',
  engineer: 'Forge',
  operations: 'Nexus',
  growth: 'Pulse',
  support: 'Shield',
  'data-analyst': 'Lens',
};

export function InfrastructureProgress({
  companyId,
  profile,
  onComplete,
  onError,
}: InfrastructureProgressProps) {
  const [components, setComponents] = useState<ComponentStatus[]>(
    Object.keys(COMPONENT_INFO).map((type) => ({
      type: type as InfrastructureAssetType,
      status: 'pending',
      progress: 0,
    }))
  );
  const [overallProgress, setOverallProgress] = useState(0);
  const [currentMessage, setCurrentMessage] = useState('Initializing infrastructure generation...');
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    startGeneration();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [companyId]);

  const startGeneration = async () => {
    try {
      const response = await fetch('/api/infrastructure/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, profile }),
      });

      if (!response.ok) {
        throw new Error('Failed to start infrastructure generation');
      }

      const reader = response.body?.getReader();
      if (!reader) return;

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
              handleEvent(event);
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      onError?.(errorMessage);
    }
  };

  const handleEvent = (event: InfraStreamEvent) => {
    switch (event.type) {
      case 'job_started':
        setCurrentMessage('Starting infrastructure generation...');
        break;

      case 'task_started':
        if (event.taskType) {
          setComponents((prev) =>
            prev.map((c) =>
              c.type === event.taskType
                ? { ...c, status: 'generating', progress: 10 }
                : c
            )
          );
          const info = COMPONENT_INFO[event.taskType];
          setCurrentMessage(`Generating ${info.name}...`);
        }
        break;

      case 'task_progress':
        if (event.taskType) {
          setComponents((prev) =>
            prev.map((c) =>
              c.type === event.taskType
                ? {
                    ...c,
                    progress: event.progress || c.progress,
                    agent: event.agentRole ? AGENT_NAMES[event.agentRole] : c.agent,
                  }
                : c
            )
          );
        }
        break;

      case 'task_completed':
        if (event.taskType) {
          setComponents((prev) =>
            prev.map((c) =>
              c.type === event.taskType
                ? { ...c, status: 'completed', progress: 100 }
                : c
            )
          );
        }
        break;

      case 'task_failed':
        if (event.taskType) {
          setComponents((prev) =>
            prev.map((c) =>
              c.type === event.taskType
                ? { ...c, status: 'failed', progress: 100 }
                : c
            )
          );
        }
        break;

      case 'job_completed':
        setIsComplete(true);
        setOverallProgress(100);
        setCurrentMessage('Infrastructure generation complete!');
        setTimeout(() => onComplete(), 2000);
        break;

      case 'job_failed':
        setError(event.error || 'Generation failed');
        onError?.(event.error || 'Generation failed');
        break;
    }

  };

  // Derive overall progress from components state
  useEffect(() => {
    const completed = components.filter((c) => c.status === 'completed' || c.status === 'failed').length;
    const generating = components.filter((c) => c.status === 'generating').length;
    const total = components.length;
    const progress = Math.round(((completed + generating * 0.5) / total) * 100);
    setOverallProgress(progress);
  }, [components]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">Generation Failed</h2>
        <p className="text-zinc-400 mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-white text-black hover:bg-white/90 rounded-lg transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      {/* Header */}
      <div className="text-center mb-8">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-16 h-16 rounded-full bg-white/[0.06] flex items-center justify-center mx-auto mb-4"
        >
          <Sparkles className="w-8 h-8 text-white" />
        </motion.div>
        <h2 className="text-2xl font-bold text-white mb-2">
          {isComplete ? 'Infrastructure Ready!' : 'Building Your Infrastructure'}
        </h2>
        <p className="text-zinc-400">{currentMessage}</p>
      </div>

      {/* Overall Progress Bar */}
      <div className="mb-8">
        <div className="flex justify-between text-sm text-zinc-400 mb-2">
          <span>Overall Progress</span>
          <span>{overallProgress}%</span>
        </div>
        <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-white"
            initial={{ width: 0 }}
            animate={{ width: `${overallProgress}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>

      {/* Component Cards */}
      <div className="grid grid-cols-2 gap-4">
        <AnimatePresence mode="popLayout">
          {components.map((component, index) => {
            const info = COMPONENT_INFO[component.type];
            const Icon = info.icon;

            return (
              <motion.div
                key={component.type}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`p-4 rounded-xl border ${
                  component.status === 'completed'
                    ? 'bg-white/[0.06] border-white/[0.12]'
                    : component.status === 'failed'
                    ? 'bg-red-500/10 border-red-500/30'
                    : component.status === 'generating'
                    ? 'bg-white/[0.04] border-white/[0.08]'
                    : 'bg-zinc-800/50 border-zinc-700/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2 rounded-lg ${
                      component.status === 'completed'
                        ? 'bg-white/[0.08]'
                        : component.status === 'failed'
                        ? 'bg-red-500/20'
                        : component.status === 'generating'
                        ? 'bg-white/[0.06]'
                        : 'bg-zinc-700/50'
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 ${
                        component.status === 'completed'
                          ? 'text-white'
                          : component.status === 'failed'
                          ? 'text-red-400'
                          : component.status === 'generating'
                          ? 'text-white/60'
                          : 'text-zinc-500'
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-white text-sm truncate">{info.name}</h3>
                      {component.status === 'completed' && (
                        <CheckCircle2 className="w-4 h-4 text-white flex-shrink-0" />
                      )}
                      {component.status === 'generating' && (
                        <Loader2 className="w-4 h-4 text-white/60 animate-spin flex-shrink-0" />
                      )}
                      {component.status === 'failed' && (
                        <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">{info.description}</p>
                    {component.agent && component.status === 'generating' && (
                      <p className="text-xs text-white/50 mt-1">{component.agent} working...</p>
                    )}
                  </div>
                </div>

                {/* Progress bar for generating components */}
                {component.status === 'generating' && (
                  <div className="mt-3 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-white"
                      initial={{ width: 0 }}
                      animate={{ width: `${component.progress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Strategic Documents Section */}
      {overallProgress >= 80 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 p-4 rounded-xl bg-zinc-800/50 border border-zinc-700/50"
        >
          <h3 className="text-sm font-medium text-white mb-2">Strategic Deliverables</h3>
          <div className="flex gap-4 text-xs text-zinc-400">
            <div className="flex items-center gap-1.5">
              {overallProgress >= 90 ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-white" />
              ) : (
                <Loader2 className="w-3.5 h-3.5 text-white/60 animate-spin" />
              )}
              Competitor Analysis
            </div>
            <div className="flex items-center gap-1.5">
              {overallProgress >= 100 ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-white" />
              ) : overallProgress >= 92 ? (
                <Loader2 className="w-3.5 h-3.5 text-white/60 animate-spin" />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full bg-zinc-700" />
              )}
              Growth Experiments
            </div>
          </div>
        </motion.div>
      )}

      {/* Completion Message */}
      {isComplete && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mt-6 p-4 rounded-xl bg-white/[0.06] border border-white/[0.12] text-center"
        >
          <CheckCircle2 className="w-8 h-8 text-white mx-auto mb-2" />
          <p className="text-white font-medium">All infrastructure generated!</p>
          <p className="text-zinc-400 text-sm mt-1">Redirecting to dashboard...</p>
        </motion.div>
      )}
    </div>
  );
}

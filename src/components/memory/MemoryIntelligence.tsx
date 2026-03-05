'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { MemoryLesson, MemoryRecommendation, MemoryDomain } from '@/lib/types';
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  CheckCircle,
  AlertCircle,
  Loader2,
  Sparkles,
  Archive,
  RefreshCw,
  Settings2,
} from 'lucide-react';

interface MemoryIntelligenceProps {
  companyId: string;
}

interface RecallConfig {
  weightSemantic: number;
  weightImportance: number;
  weightConfidence: number;
  weightRecency: number;
  weightFrequency: number;
}

interface IntelligenceData {
  recallAccuracy: number;
  totalRecalls: number;
  activeLessons: MemoryLesson[];
  pendingLessons: MemoryLesson[];
  recommendations: MemoryRecommendation[];
  config: RecallConfig;
  topMemories: { id: string; topic: string; accuracy: number }[];
  underperformingMemories: { id: string; topic: string; accuracy: number }[];
}

export function MemoryIntelligence({ companyId }: MemoryIntelligenceProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<IntelligenceData | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    loadIntelligenceData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const loadIntelligenceData = async () => {
    setIsLoading(true);
    try {
      const supabase = createClient();

      // Load recall config
      const { data: configData } = await supabase
        .from('memory_recall_configs')
        .select('*')
        .eq('company_id', companyId)
        .single();

      const config: RecallConfig = configData
        ? {
            weightSemantic: configData.weight_semantic,
            weightImportance: configData.weight_importance,
            weightConfidence: configData.weight_confidence,
            weightRecency: configData.weight_recency,
            weightFrequency: configData.weight_frequency,
          }
        : {
            weightSemantic: 0.35,
            weightImportance: 0.25,
            weightConfidence: 0.15,
            weightRecency: 0.15,
            weightFrequency: 0.1,
          };

      // Load lessons
      const { data: lessonsData } = await supabase
        .from('memory_lessons')
        .select('*')
        .eq('company_id', companyId)
        .order('updated_at', { ascending: false });

      const activeLessons = (lessonsData || [])
        .filter((l) => l.status === 'active')
        .map(mapLesson);

      const pendingLessons = (lessonsData || [])
        .filter((l) => l.status === 'proposed' || l.status === 'validating')
        .map(mapLesson);

      // Load usage stats (last 7 days)
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7);

      const { data: usageData } = await supabase
        .from('memory_usage_logs')
        .select('memory_id, was_helpful, relevance_score')
        .eq('company_id', companyId)
        .gt('created_at', cutoffDate.toISOString());

      const totalRecalls = usageData?.length || 0;
      const helpfulRecalls = usageData?.filter((u) => u.was_helpful === true).length || 0;
      const ratedRecalls = usageData?.filter((u) => u.was_helpful !== null).length || 0;
      const recallAccuracy = ratedRecalls > 0 ? helpfulRecalls / ratedRecalls : 0;

      // Calculate per-memory performance
      const memoryPerformance = new Map<string, { helpful: number; total: number }>();
      for (const usage of usageData || []) {
        const existing = memoryPerformance.get(usage.memory_id) || { helpful: 0, total: 0 };
        existing.total++;
        if (usage.was_helpful) existing.helpful++;
        memoryPerformance.set(usage.memory_id, existing);
      }

      // Get top and underperforming memory details
      const performanceList = Array.from(memoryPerformance.entries())
        .map(([id, stats]) => ({
          id,
          accuracy: stats.total > 0 ? stats.helpful / stats.total : 0,
          total: stats.total,
        }))
        .filter((m) => m.total >= 2);

      const topIds = performanceList
        .filter((m) => m.accuracy >= 0.7)
        .sort((a, b) => b.accuracy - a.accuracy)
        .slice(0, 3)
        .map((m) => m.id);

      const bottomIds = performanceList
        .filter((m) => m.accuracy < 0.5)
        .sort((a, b) => a.accuracy - b.accuracy)
        .slice(0, 3)
        .map((m) => m.id);

      // Get memory topics
      const allIds = [...topIds, ...bottomIds];
      const { data: memoriesData } = allIds.length > 0
        ? await supabase.from('company_memories').select('id, topic').in('id', allIds)
        : { data: [] };

      const topicMap = new Map((memoriesData || []).map((m) => [m.id, m.topic]));

      const topMemories = topIds.map((id) => ({
        id,
        topic: topicMap.get(id) || 'Unknown',
        accuracy: performanceList.find((p) => p.id === id)?.accuracy || 0,
      }));

      const underperformingMemories = bottomIds.map((id) => ({
        id,
        topic: topicMap.get(id) || 'Unknown',
        accuracy: performanceList.find((p) => p.id === id)?.accuracy || 0,
      }));

      // Generate recommendations based on data
      const recommendations: MemoryRecommendation[] = [];

      if (underperformingMemories.length > 0) {
        recommendations.push({
          id: crypto.randomUUID(),
          type: 'archive',
          memoryIds: underperformingMemories.map((m) => m.id),
          description: `Archive ${underperformingMemories.length} low-accuracy memories`,
          impact: 'medium',
          autoApply: false,
        });
      }

      if (recallAccuracy < 0.5 && totalRecalls >= 10) {
        recommendations.push({
          id: crypto.randomUUID(),
          type: 'weight_change',
          description: 'Increase semantic search weight for better relevance',
          impact: 'high',
          autoApply: false,
        });
      }

      setData({
        recallAccuracy,
        totalRecalls,
        activeLessons,
        pendingLessons,
        recommendations,
        config,
        topMemories,
        underperformingMemories,
      });
    } catch (error) {
      console.error('Failed to load intelligence data:', error);
    }
    setIsLoading(false);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadIntelligenceData();
    setIsRefreshing(false);
  };

  if (isLoading) {
    return (
      <div className="bg-black border border-white/6 rounded-xl p-5">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-white/40" />
          <span className="ml-2 text-white/40 text-sm">Loading intelligence...</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-black border border-white/6 rounded-xl p-5">
        <div className="text-center py-8 text-white/40 text-sm">
          No intelligence data available yet
        </div>
      </div>
    );
  }

  return (
    <div className="bg-black border border-white/6 rounded-xl p-5 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/5 rounded-lg">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Memory Intelligence</h2>
            <p className="text-xs text-white/40">Self-improving recall strategy</p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-2 hover:bg-white/5 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 text-white/40 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Recall Accuracy */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/40">Recall Accuracy (7 days)</span>
          <span className="text-sm font-medium text-white">
            {Math.round(data.recallAccuracy * 100)}%
          </span>
        </div>
        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              data.recallAccuracy >= 0.7
                ? 'bg-green-500'
                : data.recallAccuracy >= 0.5
                  ? 'bg-amber-500'
                  : 'bg-red-500'
            }`}
            style={{ width: `${data.recallAccuracy * 100}%` }}
          />
        </div>
        <p className="text-xs text-white/30">
          {data.totalRecalls} total recalls · {Math.round(data.recallAccuracy * data.totalRecalls)} helpful
        </p>
      </div>

      {/* Active Learnings */}
      {(data.activeLessons.length > 0 || data.pendingLessons.length > 0) && (
        <div className="space-y-3">
          <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider flex items-center gap-2">
            <Lightbulb className="w-3.5 h-3.5" />
            Active Learnings
          </h3>
          <div className="space-y-2">
            {data.activeLessons.map((lesson) => (
              <LessonItem key={lesson.id} lesson={lesson} status="active" />
            ))}
            {data.pendingLessons.map((lesson) => (
              <LessonItem
                key={lesson.id}
                lesson={lesson}
                status={lesson.status === 'validating' ? 'validating' : 'proposed'}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {data.recommendations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5" />
            Recommendations
          </h3>
          <div className="space-y-2">
            {data.recommendations.map((rec) => (
              <RecommendationItem key={rec.id} recommendation={rec} />
            ))}
          </div>
        </div>
      )}

      {/* Current Strategy */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider flex items-center gap-2">
          <Settings2 className="w-3.5 h-3.5" />
          Current Strategy
        </h3>
        <div className="space-y-2">
          <WeightBar label="Semantic" value={data.config.weightSemantic} />
          <WeightBar label="Importance" value={data.config.weightImportance} />
          <WeightBar label="Confidence" value={data.config.weightConfidence} />
          <WeightBar label="Recency" value={data.config.weightRecency} />
          <WeightBar label="Frequency" value={data.config.weightFrequency} />
        </div>
      </div>

      {/* Top/Bottom Performers */}
      {(data.topMemories.length > 0 || data.underperformingMemories.length > 0) && (
        <div className="grid grid-cols-2 gap-4">
          {data.topMemories.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs text-green-400/70 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                Top Performers
              </h4>
              {data.topMemories.map((m) => (
                <div
                  key={m.id}
                  className="text-xs text-white/50 truncate"
                  title={m.topic}
                >
                  {m.topic} ({Math.round(m.accuracy * 100)}%)
                </div>
              ))}
            </div>
          )}
          {data.underperformingMemories.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs text-red-400/70 flex items-center gap-1">
                <TrendingDown className="w-3 h-3" />
                Underperforming
              </h4>
              {data.underperformingMemories.map((m) => (
                <div
                  key={m.id}
                  className="text-xs text-white/50 truncate"
                  title={m.topic}
                >
                  {m.topic} ({Math.round(m.accuracy * 100)}%)
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LessonItem({
  lesson,
  status,
}: {
  lesson: MemoryLesson;
  status: 'active' | 'validating' | 'proposed';
}) {
  return (
    <div className="flex items-start gap-2 p-2 bg-white/3 rounded-lg">
      {status === 'active' ? (
        <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
      ) : status === 'validating' ? (
        <Loader2 className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5 animate-spin" />
      ) : (
        <AlertCircle className="w-4 h-4 text-white/30 flex-shrink-0 mt-0.5" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-white/70 leading-relaxed">{lesson.lesson}</p>
        <p className="text-[10px] text-white/30 mt-1">
          {status === 'validating'
            ? `Validating (${lesson.validationCycles}/${lesson.requiredCycles} cycles)`
            : status === 'active'
              ? 'Active'
              : 'Proposed'}
        </p>
      </div>
    </div>
  );
}

function RecommendationItem({ recommendation }: { recommendation: MemoryRecommendation }) {
  const icons = {
    archive: Archive,
    consolidate: RefreshCw,
    weight_change: Settings2,
    boost: TrendingUp,
    decay_adjust: TrendingDown,
  };
  const Icon = icons[recommendation.type] || AlertCircle;

  return (
    <div className="flex items-center gap-2 p-2 bg-white/3 rounded-lg">
      <Icon className="w-4 h-4 text-white/40 flex-shrink-0" />
      <span className="text-xs text-white/60 flex-1">{recommendation.description}</span>
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded ${
          recommendation.impact === 'high'
            ? 'bg-red-500/20 text-red-400'
            : recommendation.impact === 'medium'
              ? 'bg-amber-500/20 text-amber-400'
              : 'bg-white/10 text-white/50'
        }`}
      >
        {recommendation.impact}
      </span>
    </div>
  );
}

function WeightBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-white/40 w-20">{label}</span>
      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full bg-white/40 rounded-full"
          style={{ width: `${value * 100}%` }}
        />
      </div>
      <span className="text-xs text-white/50 w-10 text-right">
        {(value * 100).toFixed(0)}%
      </span>
    </div>
  );
}

function mapLesson(row: Record<string, unknown>): MemoryLesson {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    lesson: row.lesson as string,
    evidence: row.evidence as { period: string; metric: string; value: number }[],
    strategyType: row.strategy_type as MemoryLesson['strategyType'],
    strategyBefore: row.strategy_before as Record<string, unknown>,
    strategyAfter: row.strategy_after as Record<string, unknown>,
    status: row.status as MemoryLesson['status'],
    validationCycles: row.validation_cycles as number,
    requiredCycles: row.required_cycles as number,
    performanceBefore: row.performance_before as number | null,
    performanceAfter: row.performance_after as number | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

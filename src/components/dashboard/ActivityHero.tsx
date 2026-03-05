'use client';

import { useState, useEffect, useMemo } from 'react';
import { ExternalLink, Copy, Check } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import type { AgentRole, AgentActivity } from '@/lib/types';
import { AGENTS } from '@/lib/types';

interface ActivityHeroProps {
  companySlug: string;
  landingPageUrl?: string;
  socialLinks?: {
    twitter?: string;
    linkedin?: string;
  };
}

type ActivityDimension = 'build' | 'intel' | 'proactive' | 'grow' | 'monetize';

interface DimensionConfig {
  label: string;
  sublabel: string;
  icon: string;
  color: string;
  bgColor: string;
}

const DIMENSION_CONFIG: Record<ActivityDimension, DimensionConfig> = {
  build: {
    label: 'BUILD',
    sublabel: 'Engineering',
    icon: '⚡',
    color: '#8b5cf6',
    bgColor: 'rgba(139, 92, 246, 0.1)',
  },
  intel: {
    label: 'INTEL',
    sublabel: 'Competitor Intelligence',
    icon: '🔍',
    color: '#3b82f6',
    bgColor: 'rgba(59, 130, 246, 0.1)',
  },
  proactive: {
    label: 'PROACTIVE',
    sublabel: 'Proactive Measures',
    icon: '🛡️',
    color: '#06b6d4',
    bgColor: 'rgba(6, 182, 212, 0.1)',
  },
  grow: {
    label: 'GROW',
    sublabel: 'Marketing',
    icon: '📈',
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.1)',
  },
  monetize: {
    label: 'MONETIZE',
    sublabel: 'Ads & Revenue',
    icon: '💰',
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.1)',
  },
};

const ROLE_TO_DIMENSION: Record<AgentRole, ActivityDimension> = {
  engineer: 'build',
  product: 'proactive',
  marketing: 'grow',
  growth: 'grow',
  ads: 'monetize',
  ceo: 'proactive',
  operations: 'proactive',
  sales: 'monetize',
  support: 'grow',
  'data-analyst': 'intel',
  'customer-success': 'grow',
  seo: 'intel',
};

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function isToday(timestamp: string): boolean {
  const date = new Date(timestamp);
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

interface ActivityItemProps {
  activity: AgentActivity;
  dimension: ActivityDimension;
}

function ActivityItem({ activity, dimension }: ActivityItemProps) {
  const config = DIMENSION_CONFIG[dimension];

  return (
    <div
      className="group p-3 rounded-lg transition-all cursor-pointer hover:bg-white/5"
      style={{ borderLeft: `2px solid ${config.color}20` }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-white/40">{formatTime(activity.timestamp)}</span>
        <span className="text-xs text-white/50">{activity.agentName}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-white/80 line-clamp-2">{activity.action}</span>
        <ExternalLink className="w-3 h-3 text-white/30 group-hover:text-white/60 transition-colors flex-shrink-0 ml-2" />
      </div>
    </div>
  );
}

interface ActivityLaneProps {
  dimension: ActivityDimension;
  activities: AgentActivity[];
}

function ActivityLane({ dimension, activities }: ActivityLaneProps) {
  const config = DIMENSION_CONFIG[dimension];

  return (
    <div className="flex flex-col min-w-0">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/6">
        <span className="text-lg">{config.icon}</span>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-white/60 tracking-wider">{config.label}</div>
          <div className="text-xs text-white/40">{config.sublabel}</div>
        </div>
        <span
          className="ml-auto text-xs font-medium px-1.5 py-0.5 rounded"
          style={{ backgroundColor: config.bgColor, color: config.color }}
        >
          {activities.length}
        </span>
      </div>

      {/* Activities */}
      <div className="flex-1 space-y-2 overflow-y-auto max-h-[280px] pr-1">
        {activities.length > 0 ? (
          activities.map((activity) => (
            <ActivityItem key={activity.id} activity={activity} dimension={dimension} />
          ))
        ) : (
          <div className="text-center py-6 text-white/30 text-sm">
            No {config.sublabel.toLowerCase()} activity today
          </div>
        )}
      </div>
    </div>
  );
}

export default function ActivityHero({
  companySlug,
  landingPageUrl,
  socialLinks,
}: ActivityHeroProps) {
  const { activities } = useAppStore();
  const [copied, setCopied] = useState(false);

  // Filter to today's activities
  const todayActivities = useMemo(() => {
    return activities.filter((a) => isToday(a.timestamp));
  }, [activities]);

  // Group activities by dimension
  const groupedActivities = useMemo(() => {
    const groups: Record<ActivityDimension, AgentActivity[]> = {
      build: [],
      intel: [],
      proactive: [],
      grow: [],
      monetize: [],
    };

    todayActivities.forEach((activity) => {
      const dimension = ROLE_TO_DIMENSION[activity.agentRole] || 'build';
      groups[dimension].push(activity);
    });

    return groups;
  }, [todayActivities]);

  // Count activities per dimension
  const dimensionCounts = useMemo(() => {
    return {
      build: groupedActivities.build.length,
      intel: groupedActivities.intel.length,
      proactive: groupedActivities.proactive.length,
      grow: groupedActivities.grow.length,
      monetize: groupedActivities.monetize.length,
    };
  }, [groupedActivities]);

  const totalTasks = todayActivities.length;

  const handleCopy = async () => {
    const url = landingPageUrl || `https://${companySlug}.vercel.app`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayUrl = landingPageUrl || `${companySlug}.vercel.app`;
  const twitterHandle = socialLinks?.twitter?.replace(/^https?:\/\/(www\.)?twitter\.com\//, '@').replace(/^https?:\/\/(www\.)?x\.com\//, '@') || null;
  const linkedinUrl = socialLinks?.linkedin || null;

  return (
    <div className="space-y-4">
      {/* Hero Banner */}
      <div className="bg-black border border-white/6 rounded-2xl p-5 relative overflow-hidden">
        {/* Subtle gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />

        <div className="relative z-10">
          {/* Links Row */}
          <div className="flex items-center flex-wrap gap-3 mb-4">
            {/* Landing Page Link */}
            <a
              href={landingPageUrl || `https://${companySlug}.vercel.app`}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-full transition-colors"
            >
              <span className="text-sm">🌐</span>
              <span className="text-sm text-white/70 group-hover:text-white/90 transition-colors">
                {displayUrl}
              </span>
              <ExternalLink className="w-3 h-3 text-white/40 group-hover:text-white/60" />
            </a>

            {/* Copy Button */}
            <button
              onClick={handleCopy}
              className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
              title="Copy URL"
            >
              {copied ? (
                <Check className="w-4 h-4 text-white" />
              ) : (
                <Copy className="w-4 h-4 text-white/40 hover:text-white/60" />
              )}
            </button>

            {/* Twitter Link */}
            {twitterHandle && (
              <a
                href={socialLinks?.twitter?.startsWith('http') ? socialLinks.twitter : `https://twitter.com/${twitterHandle.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-full transition-colors"
              >
                <span className="text-sm font-medium">𝕏</span>
                <span className="text-sm text-white/70 group-hover:text-white/90 transition-colors">
                  {twitterHandle}
                </span>
              </a>
            )}

            {/* LinkedIn Link */}
            {linkedinUrl && (
              <a
                href={linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-full transition-colors"
              >
                <span className="text-sm font-bold text-[#0A66C2]">in</span>
                <span className="text-sm text-white/70 group-hover:text-white/90 transition-colors">
                  LinkedIn
                </span>
              </a>
            )}

            {/* Live Indicator */}
            <div className="ml-auto flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
              </span>
              <span className="text-xs font-medium text-white/90">LIVE</span>
            </div>
          </div>

          {/* Summary Line */}
          <div className="text-white/60 text-sm">
            <span className="text-white font-medium">Today:</span>{' '}
            {totalTasks > 0 ? (
              <>
                {totalTasks} task{totalTasks !== 1 ? 's' : ''} completed
                <span className="mx-2 text-white/30">·</span>
                <span className="inline-flex items-center gap-3 text-xs">
                  {dimensionCounts.build > 0 && (
                    <span style={{ color: DIMENSION_CONFIG.build.color }}>
                      {DIMENSION_CONFIG.build.icon} {dimensionCounts.build} engineering
                    </span>
                  )}
                  {dimensionCounts.intel > 0 && (
                    <span style={{ color: DIMENSION_CONFIG.intel.color }}>
                      {DIMENSION_CONFIG.intel.icon} {dimensionCounts.intel} intel
                    </span>
                  )}
                  {dimensionCounts.proactive > 0 && (
                    <span style={{ color: DIMENSION_CONFIG.proactive.color }}>
                      {DIMENSION_CONFIG.proactive.icon} {dimensionCounts.proactive} proactive
                    </span>
                  )}
                  {dimensionCounts.grow > 0 && (
                    <span style={{ color: DIMENSION_CONFIG.grow.color }}>
                      {DIMENSION_CONFIG.grow.icon} {dimensionCounts.grow} marketing
                    </span>
                  )}
                  {dimensionCounts.monetize > 0 && (
                    <span style={{ color: DIMENSION_CONFIG.monetize.color }}>
                      {DIMENSION_CONFIG.monetize.icon} {dimensionCounts.monetize} ads
                    </span>
                  )}
                </span>
              </>
            ) : (
              <span className="text-white/40">No activity yet today</span>
            )}
          </div>
        </div>
      </div>

      {/* Activity Lanes */}
      <div className="bg-black border border-white/6 rounded-2xl p-5">
        <div className="grid grid-cols-5 gap-4">
          <ActivityLane dimension="build" activities={groupedActivities.build} />
          <ActivityLane dimension="intel" activities={groupedActivities.intel} />
          <ActivityLane dimension="proactive" activities={groupedActivities.proactive} />
          <ActivityLane dimension="grow" activities={groupedActivities.grow} />
          <ActivityLane dimension="monetize" activities={groupedActivities.monetize} />
        </div>
      </div>
    </div>
  );
}

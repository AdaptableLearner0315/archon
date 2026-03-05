'use client';

import { useMemo } from 'react';
import { TrendingUp, Calendar, Target } from 'lucide-react';

interface MissionBriefProps {
  companyName: string;
  userName?: string;
  currentRevenue?: number;
  revenueGoal?: number;
  goalDeadline?: string;
  weekOverWeekChange?: number;
}

export default function MissionBrief({
  companyName,
  userName,
  currentRevenue = 68000,
  revenueGoal = 100000,
  goalDeadline = '2026-03-31',
  weekOverWeekChange = 12,
}: MissionBriefProps) {
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const progressPercent = useMemo(() => {
    return Math.min(100, Math.round((currentRevenue / revenueGoal) * 100));
  }, [currentRevenue, revenueGoal]);

  const daysRemaining = useMemo(() => {
    const deadline = new Date(goalDeadline);
    const today = new Date();
    const diffTime = deadline.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }, [goalDeadline]);

  const quarterLabel = useMemo(() => {
    const deadline = new Date(goalDeadline);
    const quarter = Math.floor(deadline.getMonth() / 3) + 1;
    return `Q${quarter}`;
  }, [goalDeadline]);

  return (
    <div className="bg-gradient-to-br from-card via-card to-primary/5 border border-border rounded-2xl p-6 relative overflow-hidden">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary rounded-full blur-3xl transform translate-x-32 -translate-y-32" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary/50 rounded-full blur-3xl transform -translate-x-24 translate-y-24" />
      </div>

      <div className="relative z-10">
        {/* Greeting */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">
            {greeting}, {userName || companyName}
          </h1>
          <p className="text-muted-foreground mt-1">
            Here&apos;s your AI organization&apos;s progress
          </p>
        </div>

        {/* Goal Progress */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Target className="w-4 h-4 text-primary" />
            <span>{quarterLabel} Revenue Goal</span>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="h-4 bg-secondary/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all duration-1000 ease-out relative"
                style={{ width: `${progressPercent}%` }}
              >
                {/* Shimmer effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold tracking-tight">
                {progressPercent}%
              </span>
              <span className="text-lg text-muted-foreground">
                ${currentRevenue.toLocaleString()} / ${revenueGoal.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Stats Row */}
          <div className="flex items-center gap-6 pt-2">
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-sm font-medium ${
                weekOverWeekChange >= 0
                  ? 'bg-success/10 text-success'
                  : 'bg-danger/10 text-danger'
              }`}>
                <TrendingUp className={`w-3.5 h-3.5 ${weekOverWeekChange < 0 ? 'rotate-180' : ''}`} />
                {weekOverWeekChange >= 0 ? '+' : ''}{weekOverWeekChange}%
              </div>
              <span className="text-sm text-muted-foreground">from last week</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span>{daysRemaining} days remaining</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

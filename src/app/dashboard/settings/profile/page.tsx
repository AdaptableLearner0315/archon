'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/lib/store';
import {
  ArrowLeft,
  Building2,
  Target,
  Users,
  Sparkles,
  MessageSquare,
  Save,
  Check,
  Loader2,
  AlertCircle,
  RefreshCw,
  Brain,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from 'lucide-react';
import Link from 'next/link';

interface OnboardingProfile {
  id: string;
  company_id: string;
  business_idea: string | null;
  business_idea_summary: string | null;
  business_type: 'saas' | 'creator' | 'services' | 'ecommerce' | null;
  target_audience: { primary: string; painPoints?: string[] } | null;
  competitors: { name: string; weakness?: string; strengths?: string[]; weaknesses?: string[] }[] | null;
  unique_value_prop: string | null;
  key_features: string[] | null;
  brand_tone: 'professional' | 'casual' | 'playful' | 'technical' | null;
  stage: 'idea' | 'mvp' | 'launched' | 'revenue' | null;
  team_size: number | null;
  founder_skills: string[] | null;
  working_style: 'move-fast' | 'balanced' | 'methodical' | null;
}

const BUSINESS_TYPE_OPTIONS = [
  { value: 'saas', label: 'SaaS' },
  { value: 'creator', label: 'Creator Economy' },
  { value: 'services', label: 'Services' },
  { value: 'ecommerce', label: 'E-commerce' },
];

const STAGE_OPTIONS = [
  { value: 'idea', label: 'Idea Stage' },
  { value: 'mvp', label: 'MVP' },
  { value: 'launched', label: 'Launched' },
  { value: 'revenue', label: 'Generating Revenue' },
];

const TONE_OPTIONS = [
  { value: 'professional', label: 'Professional' },
  { value: 'casual', label: 'Casual' },
  { value: 'playful', label: 'Playful' },
  { value: 'technical', label: 'Technical' },
];

const WORKING_STYLE_OPTIONS = [
  { value: 'move-fast', label: 'Move Fast' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'methodical', label: 'Methodical' },
];

export default function ProfileSettingsPage() {
  const router = useRouter();
  const { companyId } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [reseedingMemories, setReseedingMemories] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [resolvedCompanyId, setResolvedCompanyId] = useState<string | null>(companyId);
  const [profile, setProfile] = useState<OnboardingProfile | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [memoryCount, setMemoryCount] = useState<number>(0);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      let cId = companyId;

      if (!cId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push('/auth/login');
          return;
        }
        const { data } = await supabase
          .from('companies')
          .select('id')
          .eq('user_id', user.id)
          .single();
        if (data) {
          cId = data.id;
          setResolvedCompanyId(data.id);
        }
      }

      if (!cId) {
        router.push('/onboarding');
        return;
      }

      // Load profile
      const { data: profileData } = await supabase
        .from('onboarding_profiles')
        .select('*')
        .eq('company_id', cId)
        .single();

      if (profileData) {
        setProfile(profileData);
      }

      // Load memory count
      const { count } = await supabase
        .from('company_memories')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', cId)
        .eq('source', 'onboarding')
        .eq('is_archived', false);

      setMemoryCount(count || 0);
      setLoading(false);
    };

    load();
  }, [companyId, router]);

  const handleSave = async () => {
    const cId = resolvedCompanyId || companyId;
    if (!cId || !profile) return;

    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from('onboarding_profiles')
        .update({
          business_idea: profile.business_idea,
          business_idea_summary: profile.business_idea_summary,
          business_type: profile.business_type,
          target_audience: profile.target_audience,
          competitors: profile.competitors,
          unique_value_prop: profile.unique_value_prop,
          key_features: profile.key_features,
          brand_tone: profile.brand_tone,
          stage: profile.stage,
          team_size: profile.team_size,
          founder_skills: profile.founder_skills,
          working_style: profile.working_style,
          skipped: false,
        })
        .eq('company_id', cId);

      if (updateError) throw updateError;

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleReseedMemories = async () => {
    const cId = resolvedCompanyId || companyId;
    if (!cId || !profile) return;

    setReseedingMemories(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch('/api/onboarding/reseed-memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: cId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to reseed memories');
      }

      const data = await response.json();
      setMemoryCount(data.total);
      setSuccessMessage(`Successfully updated ${data.total} memories from your profile.`);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reseed memories');
    } finally {
      setReseedingMemories(false);
    }
  };

  const updateProfile = (updates: Partial<OnboardingProfile>) => {
    if (profile) {
      setProfile({ ...profile, ...updates });
    }
  };

  const handleRestartOnboarding = async () => {
    const cId = resolvedCompanyId || companyId;
    if (!cId) return;

    setRestarting(true);
    setError(null);

    try {
      const response = await fetch('/api/onboarding/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: cId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to restart onboarding');
      }

      const data = await response.json();
      // Redirect to onboarding with restart flag
      router.push(data.redirectUrl || '/onboarding?restart=true');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restart onboarding');
      setRestarting(false);
      setShowRestartConfirm(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading profile...
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-white mb-2">No Profile Found</h2>
          <p className="text-white/60 mb-4">Complete onboarding to create your business profile.</p>
          <Link href="/onboarding" className="px-4 py-2 bg-white text-black rounded-lg font-medium">
            Start Onboarding
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/dashboard/settings"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Settings
          </Link>
          <div className="h-5 w-px bg-border" />
          <h1 className="text-lg font-semibold">Business Profile</h1>
        </div>

        {/* Memory Status Card */}
        <div className="bg-card border border-border rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Brain className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Memory Status</p>
                <p className="text-xs text-muted-foreground">
                  {memoryCount} fact{memoryCount !== 1 ? 's' : ''} from onboarding
                </p>
              </div>
            </div>
            <button
              onClick={handleReseedMemories}
              disabled={reseedingMemories}
              className="flex items-center gap-2 px-3 py-2 bg-primary/10 text-primary rounded-lg text-sm font-medium hover:bg-primary/20 transition disabled:opacity-50"
            >
              {reseedingMemories ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Sync Memories
            </button>
          </div>
          <p className="text-xs text-white/40 mt-3">
            After editing your profile, click &quot;Sync Memories&quot; to update what your AI team knows about your business.
          </p>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="mb-6 px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-sm text-emerald-400">
            {successMessage}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-6">
          {/* Core Business Info */}
          <Section
            icon={<Building2 className="w-5 h-5 text-emerald-400" />}
            title="Business Description"
            description="What are you building?"
          >
            <textarea
              value={profile.business_idea || ''}
              onChange={(e) => updateProfile({ business_idea: e.target.value })}
              placeholder="Describe your business or product..."
              rows={3}
              className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </Section>

          <Section
            icon={<Sparkles className="w-5 h-5 text-amber-400" />}
            title="Short Name"
            description="2-3 word summary of your business"
          >
            <input
              type="text"
              value={profile.business_idea_summary || ''}
              onChange={(e) => updateProfile({ business_idea_summary: e.target.value })}
              placeholder="e.g., AI Email Tool"
              className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </Section>

          <div className="grid grid-cols-2 gap-4">
            <Section
              icon={<Building2 className="w-5 h-5 text-blue-400" />}
              title="Business Type"
              description="Your business model"
            >
              <select
                value={profile.business_type || 'saas'}
                onChange={(e) => updateProfile({ business_type: e.target.value as OnboardingProfile['business_type'] })}
                className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {BUSINESS_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Section>

            <Section
              icon={<Target className="w-5 h-5 text-purple-400" />}
              title="Stage"
              description="Where you are now"
            >
              <select
                value={profile.stage || 'idea'}
                onChange={(e) => updateProfile({ stage: e.target.value as OnboardingProfile['stage'] })}
                className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {STAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Section>
          </div>

          {/* Target Audience */}
          <Section
            icon={<Users className="w-5 h-5 text-cyan-400" />}
            title="Target Audience"
            description="Who are your customers?"
          >
            <input
              type="text"
              value={profile.target_audience?.primary || ''}
              onChange={(e) =>
                updateProfile({
                  target_audience: {
                    ...profile.target_audience,
                    primary: e.target.value,
                  },
                })
              }
              placeholder="e.g., Solo founders, small business owners"
              className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary mb-2"
            />
            <input
              type="text"
              value={profile.target_audience?.painPoints?.join(', ') || ''}
              onChange={(e) =>
                updateProfile({
                  target_audience: {
                    primary: profile.target_audience?.primary || '',
                    painPoints: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  },
                })
              }
              placeholder="Pain points (comma-separated)"
              className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </Section>

          {/* Value Prop */}
          <Section
            icon={<Sparkles className="w-5 h-5 text-pink-400" />}
            title="Unique Value Proposition"
            description="What makes you different?"
          >
            <textarea
              value={profile.unique_value_prop || ''}
              onChange={(e) => updateProfile({ unique_value_prop: e.target.value })}
              placeholder="Why should customers choose you?"
              rows={2}
              className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </Section>

          {/* Key Features */}
          <Section
            icon={<Target className="w-5 h-5 text-orange-400" />}
            title="Key Features"
            description="Main capabilities of your product"
          >
            <input
              type="text"
              value={profile.key_features?.join(', ') || ''}
              onChange={(e) =>
                updateProfile({
                  key_features: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                })
              }
              placeholder="Feature 1, Feature 2, Feature 3"
              className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </Section>

          {/* Advanced Options */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm text-white/50 hover:text-white/70 transition-colors"
          >
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {showAdvanced ? 'Hide' : 'Show'} advanced options
          </button>

          {showAdvanced && (
            <div className="space-y-6 p-4 bg-white/[0.02] rounded-xl border border-white/[0.06]">
              <Section
                icon={<MessageSquare className="w-5 h-5 text-indigo-400" />}
                title="Brand Tone"
                description="How you communicate"
              >
                <select
                  value={profile.brand_tone || 'casual'}
                  onChange={(e) => updateProfile({ brand_tone: e.target.value as OnboardingProfile['brand_tone'] })}
                  className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {TONE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Section>

              <Section
                icon={<Target className="w-5 h-5 text-teal-400" />}
                title="Working Style"
                description="Your execution approach"
              >
                <select
                  value={profile.working_style || 'balanced'}
                  onChange={(e) => updateProfile({ working_style: e.target.value as OnboardingProfile['working_style'] })}
                  className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {WORKING_STYLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Section>

              <Section
                icon={<Users className="w-5 h-5 text-rose-400" />}
                title="Founder Skills"
                description="Your background and expertise"
              >
                <input
                  type="text"
                  value={profile.founder_skills?.join(', ') || ''}
                  onChange={(e) =>
                    updateProfile({
                      founder_skills: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                    })
                  }
                  placeholder="Marketing, Design, Engineering..."
                  className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </Section>
            </div>
          )}

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg font-medium text-sm hover:bg-primary/90 transition disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <Check className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save Profile'}
          </button>

          {/* Re-onboarding Section */}
          <div className="mt-12 pt-8 border-t border-border">
            <h3 className="text-sm font-semibold text-muted-foreground mb-4">Advanced</h3>
            {showRestartConfirm ? (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5">
                <div className="flex items-start gap-3 mb-4">
                  <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-amber-400">Are you sure?</h4>
                    <p className="text-xs text-white/60 mt-1">
                      This will archive all {memoryCount} existing memories and reset your profile.
                      You&apos;ll start a fresh conversation with Atlas to re-introduce your business.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleRestartOnboarding}
                    disabled={restarting}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-black rounded-lg font-medium text-sm hover:bg-amber-400 transition disabled:opacity-50"
                  >
                    {restarting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RotateCcw className="w-4 h-4" />
                    )}
                    {restarting ? 'Restarting...' : 'Yes, restart'}
                  </button>
                  <button
                    onClick={() => setShowRestartConfirm(false)}
                    disabled={restarting}
                    className="px-4 py-2 bg-white/5 text-white/70 rounded-lg text-sm hover:bg-white/10 transition disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowRestartConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white/5 text-white/60 rounded-lg text-sm hover:bg-white/10 hover:text-white/80 transition"
              >
                <RotateCcw className="w-4 h-4" />
                Re-introduce Yourself
              </button>
            )}
            <p className="text-xs text-white/30 mt-2">
              If your business has pivoted significantly, you can start fresh by having a new conversation with Atlas.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-3 mb-3">
        {icon}
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

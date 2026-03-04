'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/lib/store';
import {
  ArrowLeft,
  Mail,
  MessageCircle,
  Hash,
  Bell,
  Clock,
  Save,
  Check,
  Loader2,
  Globe,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';

interface Preferences {
  email_enabled: boolean;
  email_address: string | null;
  whatsapp_enabled: boolean;
  whatsapp_number: string | null;
  digest_format: string;
  digest_frequency: string;
  slack_enabled: boolean;
  slack_webhook_url: string | null;
  webapp_enabled: boolean;
}

const DEFAULT_PREFS: Preferences = {
  email_enabled: true,
  email_address: null,
  whatsapp_enabled: false,
  whatsapp_number: null,
  digest_format: 'detailed',
  digest_frequency: 'hourly',
  slack_enabled: false,
  slack_webhook_url: null,
  webapp_enabled: true,
};

interface AdPlatformCredential {
  id: string;
  platform: string;
  account_id: string | null;
  is_active: boolean;
  created_at: string;
}

export default function SettingsPage() {
  const { companyId } = useAppStore();
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedCompanyId, setResolvedCompanyId] = useState<string | null>(companyId);
  const [adCredentials, setAdCredentials] = useState<AdPlatformCredential[]>([]);
  const [companyPlan, setCompanyPlan] = useState<string>('starter');

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      let cId = companyId;
      if (!cId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from('companies')
          .select('id, plan')
          .eq('user_id', user.id)
          .single();
        if (data) {
          cId = data.id;
          setResolvedCompanyId(data.id);
          setCompanyPlan(data.plan || 'starter');
        }
      } else {
        // Fetch company plan
        const { data } = await supabase
          .from('companies')
          .select('plan')
          .eq('id', cId)
          .single();
        if (data) setCompanyPlan(data.plan || 'starter');
      }
      if (!cId) return;

      try {
        const res = await fetch(`/api/agents/notifications/preferences?companyId=${cId}`);
        if (res.ok) {
          const data = await res.json();
          setPrefs({ ...DEFAULT_PREFS, ...data.preferences });
        }
      } catch {
        // Use defaults
      }

      // Load ad platform credentials if Scale tier
      try {
        const { data: creds } = await supabase
          .from('ad_platform_credentials')
          .select('id, platform, account_id, is_active, created_at')
          .eq('company_id', cId);
        if (creds) setAdCredentials(creds);
      } catch {
        // Ignore
      }

      setLoading(false);
    };
    load();
  }, [companyId]);

  const handleSave = async () => {
    const cId = resolvedCompanyId || companyId;
    if (!cId) return;
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch('/api/agents/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: cId,
          emailEnabled: prefs.email_enabled,
          emailAddress: prefs.email_address || null,
          whatsappEnabled: prefs.whatsapp_enabled,
          whatsappNumber: prefs.whatsapp_number || null,
          digestFormat: prefs.digest_format,
          digestFrequency: prefs.digest_frequency,
          slackEnabled: prefs.slack_enabled,
          slackWebhookUrl: prefs.slack_webhook_url || null,
          webappEnabled: prefs.webapp_enabled,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading settings...
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
            href="/dashboard"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </Link>
          <div className="h-5 w-px bg-border" />
          <h1 className="text-lg font-semibold">Notification Settings</h1>
        </div>

        <div className="space-y-6">
          {/* Digest Frequency */}
          <Section
            icon={<Clock className="w-5 h-5 text-primary" />}
            title="Digest Frequency"
            description="How often you receive cycle summaries"
          >
            <div className="grid grid-cols-4 gap-2">
              {(['hourly', '6h', 'daily', 'weekly'] as const).map((freq) => (
                <button
                  key={freq}
                  onClick={() => setPrefs((p) => ({ ...p, digest_frequency: freq }))}
                  className={`px-3 py-2 text-sm rounded-lg border transition ${
                    prefs.digest_frequency === freq
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border text-muted-foreground hover:border-foreground/30'
                  }`}
                >
                  {freq === '6h' ? 'Every 6h' : freq.charAt(0).toUpperCase() + freq.slice(1)}
                </button>
              ))}
            </div>
          </Section>

          {/* Email */}
          <Section
            icon={<Mail className="w-5 h-5 text-blue-400" />}
            title="Email Notifications"
            description="Receive digests and nudges via email"
            toggle={{
              checked: prefs.email_enabled,
              onChange: (v) => setPrefs((p) => ({ ...p, email_enabled: v })),
            }}
          >
            {prefs.email_enabled && (
              <input
                type="email"
                placeholder="you@example.com"
                value={prefs.email_address || ''}
                onChange={(e) => setPrefs((p) => ({ ...p, email_address: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              />
            )}
          </Section>

          {/* WhatsApp */}
          <Section
            icon={<MessageCircle className="w-5 h-5 text-green-400" />}
            title="WhatsApp Notifications"
            description="Receive updates and reply to unblock agents"
            toggle={{
              checked: prefs.whatsapp_enabled,
              onChange: (v) => setPrefs((p) => ({ ...p, whatsapp_enabled: v })),
            }}
          >
            {prefs.whatsapp_enabled && (
              <input
                type="tel"
                placeholder="+1234567890"
                value={prefs.whatsapp_number || ''}
                onChange={(e) => setPrefs((p) => ({ ...p, whatsapp_number: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              />
            )}
          </Section>

          {/* Slack */}
          <Section
            icon={<Hash className="w-5 h-5 text-purple-400" />}
            title="Slack Notifications"
            description="Post cycle updates to a Slack channel"
            toggle={{
              checked: prefs.slack_enabled,
              onChange: (v) => setPrefs((p) => ({ ...p, slack_enabled: v })),
            }}
          >
            {prefs.slack_enabled && (
              <input
                type="url"
                placeholder="https://hooks.slack.com/services/..."
                value={prefs.slack_webhook_url || ''}
                onChange={(e) => setPrefs((p) => ({ ...p, slack_webhook_url: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              />
            )}
          </Section>

          {/* In-app */}
          <Section
            icon={<Bell className="w-5 h-5 text-amber-400" />}
            title="In-App Notifications"
            description="Show notifications in the dashboard bell"
            toggle={{
              checked: prefs.webapp_enabled,
              onChange: (v) => setPrefs((p) => ({ ...p, webapp_enabled: v })),
            }}
          />

          {/* Digest Format */}
          <Section
            icon={<Mail className="w-5 h-5 text-muted-foreground" />}
            title="Digest Format"
            description="Level of detail in digest emails"
          >
            <div className="grid grid-cols-2 gap-2">
              {(['brief', 'detailed'] as const).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => setPrefs((p) => ({ ...p, digest_format: fmt }))}
                  className={`px-3 py-2 text-sm rounded-lg border transition ${
                    prefs.digest_format === fmt
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border text-muted-foreground hover:border-foreground/30'
                  }`}
                >
                  {fmt.charAt(0).toUpperCase() + fmt.slice(1)}
                </button>
              ))}
            </div>
          </Section>

          {/* Ad Platform Connections (Scale tier only) */}
          {companyPlan === 'scale' && (
            <div className="mt-8 pt-8 border-t border-border">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Globe className="w-5 h-5 text-primary" />
                Ad Platform Connections
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                Connect your ad accounts to let Spark manage your campaigns. Changes above 10% of your daily budget will require your approval.
              </p>

              <div className="space-y-3">
                {/* Google Ads */}
                <AdPlatformRow
                  platform="google"
                  name="Google Ads"
                  connected={adCredentials.some(c => c.platform === 'google' && c.is_active)}
                  accountId={adCredentials.find(c => c.platform === 'google')?.account_id}
                  onConnect={() => window.open('/api/ads/connect/google', '_blank')}
                  onDisconnect={async () => {
                    const supabase = createClient();
                    const cId = resolvedCompanyId || companyId;
                    await supabase
                      .from('ad_platform_credentials')
                      .delete()
                      .eq('company_id', cId)
                      .eq('platform', 'google');
                    setAdCredentials(prev => prev.filter(c => c.platform !== 'google'));
                  }}
                />

                {/* Meta (Facebook/Instagram) */}
                <AdPlatformRow
                  platform="meta"
                  name="Meta (Facebook/Instagram)"
                  connected={adCredentials.some(c => c.platform === 'meta' && c.is_active)}
                  accountId={adCredentials.find(c => c.platform === 'meta')?.account_id}
                  onConnect={() => window.open('/api/ads/connect/meta', '_blank')}
                  onDisconnect={async () => {
                    const supabase = createClient();
                    const cId = resolvedCompanyId || companyId;
                    await supabase
                      .from('ad_platform_credentials')
                      .delete()
                      .eq('company_id', cId)
                      .eq('platform', 'meta');
                    setAdCredentials(prev => prev.filter(c => c.platform !== 'meta'));
                  }}
                />

                {/* TikTok */}
                <AdPlatformRow
                  platform="tiktok"
                  name="TikTok Ads"
                  connected={adCredentials.some(c => c.platform === 'tiktok' && c.is_active)}
                  accountId={adCredentials.find(c => c.platform === 'tiktok')?.account_id}
                  onConnect={() => {}}
                  onDisconnect={() => {}}
                  comingSoon
                />

                {/* LinkedIn */}
                <AdPlatformRow
                  platform="linkedin"
                  name="LinkedIn Ads"
                  connected={adCredentials.some(c => c.platform === 'linkedin' && c.is_active)}
                  accountId={adCredentials.find(c => c.platform === 'linkedin')?.account_id}
                  onConnect={() => {}}
                  onDisconnect={() => {}}
                  comingSoon
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="px-4 py-3 bg-danger/10 border border-danger/30 rounded-lg text-sm text-danger">
              {error}
            </div>
          )}

          {/* Save button */}
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
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  description,
  toggle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  toggle?: { checked: boolean; onChange: (v: boolean) => void };
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        {toggle && (
          <button
            onClick={() => toggle.onChange(!toggle.checked)}
            className={`relative w-10 h-5 rounded-full transition ${
              toggle.checked ? 'bg-primary' : 'bg-secondary'
            }`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                toggle.checked ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        )}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

function AdPlatformRow({
  platform,
  name,
  connected,
  accountId,
  onConnect,
  onDisconnect,
  comingSoon = false,
}: {
  platform: string;
  name: string;
  connected: boolean;
  accountId?: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  comingSoon?: boolean;
}) {
  const platformIcons: Record<string, string> = {
    google: '/icons/google-ads.svg',
    meta: '/icons/meta.svg',
    tiktok: '/icons/tiktok.svg',
    linkedin: '/icons/linkedin.svg',
  };

  return (
    <div className={`flex items-center justify-between p-4 bg-card border border-border rounded-xl ${comingSoon ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
          {platformIcons[platform] ? (
            <span className="text-lg font-bold text-muted-foreground">
              {platform.charAt(0).toUpperCase()}
            </span>
          ) : (
            <Globe className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
        <div>
          <p className="text-sm font-medium">{name}</p>
          {connected && accountId && (
            <p className="text-xs text-muted-foreground">Account: {accountId}</p>
          )}
          {comingSoon && (
            <p className="text-xs text-primary">Coming soon</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {connected ? (
          <>
            <span className="flex items-center gap-1 text-xs text-green-400">
              <Check className="w-3 h-3" />
              Connected
            </span>
            <button
              onClick={onDisconnect}
              className="p-2 text-muted-foreground hover:text-danger transition"
              title="Disconnect"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        ) : (
          <button
            onClick={onConnect}
            disabled={comingSoon}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Connect
            <ExternalLink className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

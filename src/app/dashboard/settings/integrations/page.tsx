'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Plug,
  Loader2,
  CheckCircle,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/lib/store';
import { ConnectedAccountCard } from '@/components/provisioning';
import {
  PROVIDER_INFO,
  type OAuthProvider,
  type ConnectedAccount,
} from '@/lib/provisioning/types';

// Providers grouped by category
const PROVIDER_CATEGORIES = {
  deployment: {
    label: 'Deployment',
    description: 'Deploy your generated assets',
    providers: ['vercel', 'supabase'] as OAuthProvider[],
  },
  social: {
    label: 'Social Media',
    description: 'Post and schedule content',
    providers: ['twitter', 'linkedin', 'youtube'] as OAuthProvider[],
  },
  ads: {
    label: 'Advertising',
    description: 'Run ad campaigns',
    providers: ['tiktok'] as OAuthProvider[],
  },
};

function IntegrationsContent() {
  const { companyId } = useAppStore();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [resolvedCompanyId, setResolvedCompanyId] = useState<string | null>(companyId);
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Check for OAuth callback results
  useEffect(() => {
    const connected = searchParams.get('connected');
    const accountName = searchParams.get('account');
    const error = searchParams.get('error');

    if (connected) {
      setToast({
        type: 'success',
        message: `Successfully connected ${accountName || connected}`,
      });
      // Clear URL params
      window.history.replaceState({}, '', '/dashboard/settings/integrations');
    } else if (error) {
      setToast({
        type: 'error',
        message: error,
      });
      window.history.replaceState({}, '', '/dashboard/settings/integrations');
    }
  }, [searchParams]);

  // Clear toast after 5 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Load connected accounts
  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      let cId = companyId;

      if (!cId) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

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

      if (!cId) return;

      try {
        const response = await fetch(
          `/api/provisioning/accounts?companyId=${cId}`
        );
        if (response.ok) {
          const data = await response.json();
          setAccounts(data.accounts || []);
        }
      } catch (error) {
        console.error('Failed to load accounts:', error);
      }

      setLoading(false);
    };

    load();
  }, [companyId]);

  const refreshAccounts = async () => {
    const cId = resolvedCompanyId || companyId;
    if (!cId) return;

    try {
      const response = await fetch(`/api/provisioning/accounts?companyId=${cId}`);
      if (response.ok) {
        const data = await response.json();
        setAccounts(data.accounts || []);
      }
    } catch (error) {
      console.error('Failed to refresh accounts:', error);
    }
  };

  const getAccountForProvider = (
    provider: OAuthProvider
  ): ConnectedAccount | null => {
    return accounts.find((a) => a.provider === provider) || null;
  };

  const effectiveCompanyId = resolvedCompanyId || companyId;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading integrations...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8">
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
          <div className="flex items-center gap-2">
            <Plug className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold">Integrations</h1>
          </div>
        </div>

        {/* Toast notification */}
        {toast && (
          <div
            className={`mb-6 px-4 py-3 rounded-lg flex items-center gap-2 text-sm ${
              toast.type === 'success'
                ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                : 'bg-red-500/10 border border-red-500/30 text-red-400'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            {toast.message}
          </div>
        )}

        {/* Intro */}
        <div className="mb-8">
          <p className="text-sm text-muted-foreground">
            Connect your accounts to enable one-click deployment of generated
            assets. Your AI team can then deploy landing pages, post to social
            media, and run ad campaigns automatically.
          </p>
        </div>

        {/* Refresh button */}
        <div className="flex justify-end mb-4">
          <button
            onClick={refreshAccounts}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        </div>

        {/* Provider categories */}
        <div className="space-y-8">
          {Object.entries(PROVIDER_CATEGORIES).map(([key, category]) => (
            <section key={key}>
              <div className="mb-4">
                <h2 className="text-sm font-semibold">{category.label}</h2>
                <p className="text-xs text-muted-foreground">
                  {category.description}
                </p>
              </div>

              <div className="space-y-3">
                {category.providers.map((provider) => (
                  <ConnectedAccountCard
                    key={provider}
                    provider={provider}
                    account={getAccountForProvider(provider)}
                    companyId={effectiveCompanyId || ''}
                    onDisconnect={refreshAccounts}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Cost disclaimer */}
        <div className="mt-10 pt-8 border-t border-border">
          <h3 className="text-sm font-semibold mb-2">Cost Information</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Some integrations may have associated costs from the providers:
          </p>
          <ul className="space-y-2 text-xs text-muted-foreground">
            {Object.values(PROVIDER_INFO)
              .filter((p) => p.costNote)
              .map((provider) => (
                <li key={provider.id} className="flex items-start gap-2">
                  <span className="text-amber-400">•</span>
                  <span>
                    <strong className="text-foreground">{provider.name}:</strong>{' '}
                    {provider.costNote}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading...
          </div>
        </div>
      }
    >
      <IntegrationsContent />
    </Suspense>
  );
}

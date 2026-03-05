'use client';

import { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import type { OAuthProvider } from '@/lib/provisioning/types';

interface AccountConnectorProps {
  provider: OAuthProvider;
  companyId: string;
  connected: boolean;
  label?: string;
  className?: string;
  onConnect?: () => void;
  returnUrl?: string;
}

export function AccountConnector({
  provider,
  companyId,
  connected,
  label,
  className = '',
  onConnect,
  returnUrl = '/dashboard/settings/integrations',
}: AccountConnectorProps) {
  const [loading, setLoading] = useState(false);

  const handleConnect = () => {
    if (connected) return;

    setLoading(true);
    onConnect?.();

    // Redirect to OAuth authorization endpoint
    const params = new URLSearchParams({
      companyId,
      returnUrl,
    });

    window.location.href = `/api/oauth/${provider}/authorize?${params.toString()}`;
  };

  if (connected) {
    return (
      <span className={`flex items-center gap-1.5 text-xs text-green-400 ${className}`}>
        Connected
      </span>
    );
  }

  return (
    <button
      onClick={handleConnect}
      disabled={loading}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {loading ? (
        <>
          <Loader2 className="w-3 h-3 animate-spin" />
          Connecting...
        </>
      ) : (
        <>
          {label || 'Connect'}
          <ExternalLink className="w-3 h-3" />
        </>
      )}
    </button>
  );
}

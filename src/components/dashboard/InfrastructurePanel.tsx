'use client';

/**
 * Infrastructure Panel Component
 *
 * Dashboard panel showing all 6 generated infrastructure assets.
 * Includes view, edit, regenerate, and deploy options.
 */

import { useState, useEffect, useCallback } from 'react';
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
  RefreshCw,
  Eye,
  Download,
  ChevronRight,
  X,
  BarChart3,
  Lightbulb,
  Rocket,
  ExternalLink,
  Link as LinkIcon,
} from 'lucide-react';
import type { InfrastructureAssetType } from '@/lib/infrastructure';

interface InfrastructurePanelProps {
  companyId: string;
}

interface Asset {
  type: InfrastructureAssetType;
  status: string;
  content: unknown;
  metadata?: {
    deployed?: boolean;
    deployedUrl?: string;
    deployedAt?: string;
  };
}

interface StrategicDoc {
  type: string;
  content: unknown;
  created_at: string;
}

interface DeploymentStatus {
  deployed: boolean;
  url?: string;
  deployedAt?: string;
}

interface DeploymentProgress {
  stage: string;
  progress: number;
  message: string;
  url?: string;
  error?: string;
}

const COMPONENT_INFO: Record<InfrastructureAssetType, { name: string; icon: typeof Layout; description: string }> = {
  landing: {
    name: 'Landing Page',
    icon: Layout,
    description: 'Conversion-optimized homepage with hero, features, and CTA',
  },
  server: {
    name: 'Server Config',
    icon: Server,
    description: 'Vercel/Docker deployment with monitoring and security',
  },
  database: {
    name: 'Database Schema',
    icon: Database,
    description: 'Business-specific tables with RLS and migrations',
  },
  email: {
    name: 'Email Templates',
    icon: Mail,
    description: 'Welcome sequence and transactional templates',
  },
  social: {
    name: 'Social Strategy',
    icon: Twitter,
    description: 'Twitter profile, content calendar, and growth tactics',
  },
  faqs: {
    name: 'Help Center',
    icon: HelpCircle,
    description: 'FAQ content with search and analytics',
  },
};

export function InfrastructurePanel({ companyId }: InfrastructurePanelProps) {
  const [assets, setAssets] = useState<Record<InfrastructureAssetType, Asset | null>>({
    landing: null,
    server: null,
    database: null,
    email: null,
    social: null,
    faqs: null,
  });
  const [strategicDocs, setStrategicDocs] = useState<StrategicDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState<InfrastructureAssetType | null>(null);
  const [regenerating, setRegenerating] = useState<InfrastructureAssetType | null>(null);
  const [viewingDoc, setViewingDoc] = useState<string | null>(null);
  const [deployments, setDeployments] = useState<Record<string, DeploymentStatus>>({});
  const [deploying, setDeploying] = useState<InfrastructureAssetType | null>(null);
  const [deployProgress, setDeployProgress] = useState<DeploymentProgress | null>(null);
  const [vercelConnected, setVercelConnected] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/infrastructure/status?companyId=${companyId}`);
      const data = await response.json();

      if (data.success) {
        setAssets(data.assets);
        setStrategicDocs(data.strategicDocuments || []);
      }

      // Also fetch deployment status
      const provisionResponse = await fetch(`/api/provision/status?companyId=${companyId}`);
      if (provisionResponse.ok) {
        const provisionData = await provisionResponse.json();
        setDeployments(provisionData.deployments || {});
      }

      // Check if Vercel is connected
      const accountsResponse = await fetch(`/api/provisioning/accounts?companyId=${companyId}`);
      if (accountsResponse.ok) {
        const accountsData = await accountsResponse.json();
        const vercelAccount = accountsData.accounts?.find(
          (a: { provider: string; status: string }) => a.provider === 'vercel' && a.status === 'active'
        );
        setVercelConnected(!!vercelAccount);
      }
    } catch (error) {
      console.error('Failed to fetch infrastructure status:', error);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleDeploy = async (type: InfrastructureAssetType) => {
    if (deploying) return;

    if (!vercelConnected) {
      // Redirect to integrations page
      window.location.href = '/dashboard/settings/integrations';
      return;
    }

    setDeploying(type);
    setDeployProgress({ stage: 'preparing', progress: 0, message: 'Starting deployment...' });

    try {
      const response = await fetch('/api/provision/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          assetType: type,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error('Failed to start deployment');
      }

      // Handle SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            const eventType = line.slice(6).trim();
            const dataLine = lines[lines.indexOf(line) + 1];
            if (dataLine?.startsWith('data:')) {
              try {
                const data = JSON.parse(dataLine.slice(5));

                if (eventType === 'progress') {
                  setDeployProgress({
                    stage: data.stage,
                    progress: data.progress,
                    message: data.message,
                    url: data.url,
                  });
                } else if (eventType === 'completed') {
                  setDeployProgress({
                    stage: 'ready',
                    progress: 100,
                    message: 'Deployed successfully!',
                    url: data.url,
                  });
                  // Update deployments state
                  setDeployments((prev) => ({
                    ...prev,
                    [type]: {
                      deployed: true,
                      url: data.url,
                      deployedAt: new Date().toISOString(),
                    },
                  }));
                } else if (eventType === 'error') {
                  setDeployProgress({
                    stage: 'error',
                    progress: 0,
                    message: data.error || 'Deployment failed',
                    error: data.error,
                  });
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Deploy error:', error);
      setDeployProgress({
        stage: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Deployment failed',
        error: error instanceof Error ? error.message : 'Deployment failed',
      });
    } finally {
      setDeploying(null);
      // Clear progress after 5 seconds if successful
      setTimeout(() => {
        setDeployProgress((prev) => (prev?.stage === 'ready' ? null : prev));
      }, 5000);
    }
  };

  const handleRegenerate = async (type: InfrastructureAssetType) => {
    setRegenerating(type);
    try {
      await fetch('/api/infrastructure/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, assetType: type }),
      });
      // Refresh status after a delay
      setTimeout(fetchStatus, 2000);
    } catch (error) {
      console.error('Failed to regenerate:', error);
    } finally {
      setRegenerating(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'generating':
        return <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      default:
        return <div className="w-4 h-4 rounded-full bg-zinc-600" />;
    }
  };

  const completedCount = Object.values(assets).filter(
    (a) => a?.status === 'completed'
  ).length;

  if (loading) {
    return (
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
          <span className="ml-2 text-zinc-400">Loading infrastructure...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Infrastructure</h2>
          <p className="text-sm text-zinc-400">
            {completedCount}/6 components ready
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">
            {completedCount === 6 ? 'All complete' : 'In progress'}
          </span>
          <div className={`w-2 h-2 rounded-full ${
            completedCount === 6 ? 'bg-emerald-400' : 'bg-purple-400 animate-pulse'
          }`} />
        </div>
      </div>

      {/* Deploy Progress Banner */}
      {deployProgress && (
        <div className={`mx-4 mt-4 p-3 rounded-lg border ${
          deployProgress.stage === 'error'
            ? 'bg-red-500/10 border-red-500/30'
            : deployProgress.stage === 'ready'
            ? 'bg-emerald-500/10 border-emerald-500/30'
            : 'bg-purple-500/10 border-purple-500/30'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {deployProgress.stage === 'error' ? (
                <AlertCircle className="w-4 h-4 text-red-400" />
              ) : deployProgress.stage === 'ready' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
              )}
              <span className={`text-sm ${
                deployProgress.stage === 'error'
                  ? 'text-red-400'
                  : deployProgress.stage === 'ready'
                  ? 'text-emerald-400'
                  : 'text-purple-400'
              }`}>
                {deployProgress.message}
              </span>
            </div>
            {deployProgress.url && (
              <a
                href={deployProgress.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300"
              >
                Open <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          {deployProgress.stage !== 'error' && deployProgress.stage !== 'ready' && (
            <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-purple-500"
                initial={{ width: 0 }}
                animate={{ width: `${deployProgress.progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          )}
        </div>
      )}

      {/* Assets Grid */}
      <div className="p-4 grid grid-cols-2 lg:grid-cols-3 gap-3">
        {(Object.keys(COMPONENT_INFO) as InfrastructureAssetType[]).map((type) => {
          const info = COMPONENT_INFO[type];
          const asset = assets[type];
          const Icon = info.icon;
          const isComplete = asset?.status === 'completed';
          const deployment = deployments[type];
          const isDeploying = deploying === type;
          const canDeploy = type === 'landing' && isComplete;

          return (
            <div
              key={type}
              className={`p-3 rounded-lg border transition-all ${
                isComplete
                  ? 'bg-zinc-800/50 border-zinc-700'
                  : 'bg-zinc-800/30 border-zinc-800 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className={`p-2 rounded-lg ${
                  isComplete ? 'bg-purple-500/20' : 'bg-zinc-700/50'
                }`}>
                  <Icon className={`w-4 h-4 ${
                    isComplete ? 'text-purple-400' : 'text-zinc-500'
                  }`} />
                </div>
                <div className="flex items-center gap-1">
                  {deployment?.deployed && (
                    <span className="flex items-center gap-1 text-xs text-emerald-400" title="Deployed">
                      <Rocket className="w-3 h-3" />
                    </span>
                  )}
                  {getStatusIcon(asset?.status || 'pending')}
                </div>
              </div>
              <h3 className="font-medium text-sm text-white">{info.name}</h3>
              <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">
                {info.description}
              </p>

              {/* Deployed URL */}
              {deployment?.url && (
                <a
                  href={deployment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 mt-2 text-xs text-purple-400 hover:text-purple-300 truncate"
                >
                  <LinkIcon className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{deployment.url.replace('https://', '')}</span>
                </a>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => isComplete && setSelectedAsset(type)}
                  disabled={!isComplete}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-zinc-700/50 hover:bg-zinc-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Eye className="w-3 h-3" />
                  View
                </button>

                {canDeploy && (
                  <button
                    onClick={() => handleDeploy(type)}
                    disabled={isDeploying}
                    className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                      deployment?.deployed
                        ? 'bg-zinc-700/50 hover:bg-zinc-700 text-zinc-300'
                        : 'bg-purple-600 hover:bg-purple-700 text-white'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {isDeploying ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Rocket className="w-3 h-3" />
                    )}
                    {deployment?.deployed ? 'Redeploy' : 'Deploy'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Strategic Documents Section */}
      {strategicDocs.length > 0 && (
        <div className="border-t border-zinc-800 p-4">
          <h3 className="text-sm font-medium text-white mb-3">Strategic Deliverables</h3>
          <div className="flex gap-2">
            {strategicDocs.map((doc) => (
              <button
                key={doc.type}
                onClick={() => setViewingDoc(doc.type)}
                className="flex items-center gap-2 px-3 py-2 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700 rounded-lg transition-colors"
              >
                {doc.type === 'competitor_analysis' ? (
                  <BarChart3 className="w-4 h-4 text-blue-400" />
                ) : (
                  <Lightbulb className="w-4 h-4 text-amber-400" />
                )}
                <span className="text-sm text-white">
                  {doc.type === 'competitor_analysis' ? 'Competitor Analysis' : 'Growth Experiments'}
                </span>
                <ChevronRight className="w-4 h-4 text-zinc-500" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Asset Detail Modal */}
      <AnimatePresence>
        {selectedAsset && (
          <AssetDetailModal
            type={selectedAsset}
            asset={assets[selectedAsset]}
            onClose={() => setSelectedAsset(null)}
            onRegenerate={() => handleRegenerate(selectedAsset)}
            regenerating={regenerating === selectedAsset}
            onDeploy={() => handleDeploy(selectedAsset)}
            deploying={deploying === selectedAsset}
            deployment={deployments[selectedAsset]}
            vercelConnected={vercelConnected}
          />
        )}
      </AnimatePresence>

      {/* Strategic Doc Modal */}
      <AnimatePresence>
        {viewingDoc && (
          <StrategicDocModal
            type={viewingDoc}
            doc={strategicDocs.find((d) => d.type === viewingDoc)}
            onClose={() => setViewingDoc(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Asset Detail Modal Component
function AssetDetailModal({
  type,
  asset,
  onClose,
  onRegenerate,
  regenerating,
  onDeploy,
  deploying,
  deployment,
  vercelConnected,
}: {
  type: InfrastructureAssetType;
  asset: Asset | null;
  onClose: () => void;
  onRegenerate: () => void;
  regenerating: boolean;
  onDeploy?: () => void;
  deploying?: boolean;
  deployment?: DeploymentStatus;
  vercelConnected?: boolean;
}) {
  const info = COMPONENT_INFO[type];
  const Icon = info.icon;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <Icon className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="font-semibold text-white">{info.name}</h2>
              <p className="text-sm text-zinc-400">{info.description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {asset?.content ? (
            <pre className="text-sm text-zinc-300 bg-zinc-800/50 p-4 rounded-lg overflow-x-auto">
              {JSON.stringify(asset.content, null, 2)}
            </pre>
          ) : (
            <p className="text-zinc-400 text-center py-8">No content available</p>
          )}
        </div>

        {/* Deployment Status */}
        {deployment?.deployed && (
          <div className="px-4 py-3 border-t border-zinc-800 bg-emerald-500/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Rocket className="w-4 h-4 text-emerald-400" />
                <span className="text-sm text-emerald-400">Deployed</span>
              </div>
              {deployment.url && (
                <a
                  href={deployment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300"
                >
                  {deployment.url.replace('https://', '')}
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="p-4 border-t border-zinc-800 flex justify-between items-center">
          <div className="flex gap-2">
            <button
              onClick={onRegenerate}
              disabled={regenerating}
              className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-sm text-white transition-colors disabled:opacity-50"
            >
              {regenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Regenerate
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify(asset?.content, null, 2)], {
                  type: 'application/json',
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${type}-config.json`;
                a.click();
              }}
              className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-sm text-white transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            {type === 'landing' && onDeploy && (
              <button
                onClick={onDeploy}
                disabled={deploying || !vercelConnected}
                title={!vercelConnected ? 'Connect Vercel first' : undefined}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white transition-colors disabled:opacity-50 ${
                  deployment?.deployed
                    ? 'bg-zinc-700 hover:bg-zinc-600'
                    : 'bg-purple-600 hover:bg-purple-700'
                }`}
              >
                {deploying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Rocket className="w-4 h-4" />
                )}
                {deployment?.deployed ? 'Redeploy' : 'Deploy to Vercel'}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Strategic Document Modal Component
function StrategicDocModal({
  type,
  doc,
  onClose,
}: {
  type: string;
  doc: StrategicDoc | undefined;
  onClose: () => void;
}) {
  const isCompetitor = type === 'competitor_analysis';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-3xl w-full max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${
              isCompetitor ? 'bg-blue-500/20' : 'bg-amber-500/20'
            }`}>
              {isCompetitor ? (
                <BarChart3 className="w-5 h-5 text-blue-400" />
              ) : (
                <Lightbulb className="w-5 h-5 text-amber-400" />
              )}
            </div>
            <div>
              <h2 className="font-semibold text-white">
                {isCompetitor ? 'Competitor Analysis' : 'Growth Experiments'}
              </h2>
              <p className="text-sm text-zinc-400">
                {isCompetitor
                  ? 'Market positioning and competitive insights'
                  : 'Testable experiments for growth'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {doc?.content ? (
            <StrategicDocContent type={type} content={doc.content} />
          ) : (
            <p className="text-zinc-400 text-center py-8">No content available</p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// Formatted Strategic Document Content
function StrategicDocContent({ type, content }: { type: string; content: unknown }) {
  const data = content as Record<string, unknown>;

  if (type === 'competitor_analysis') {
    const competitors = (data.competitors as { name: string; strengths?: string[]; weaknesses?: string[] }[]) || [];
    const gaps = (data.gapAnalysis as { gap: string; opportunity: string }[]) || [];
    const advantages = (data.competitiveAdvantages as string[]) || [];

    return (
      <div className="space-y-6">
        {/* Competitors */}
        <div>
          <h3 className="text-sm font-medium text-white mb-3">Competitors</h3>
          <div className="space-y-3">
            {competitors.map((comp, i) => (
              <div key={i} className="p-3 bg-zinc-800/50 rounded-lg">
                <h4 className="font-medium text-white">{comp.name}</h4>
                <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-emerald-400 text-xs">Strengths</span>
                    <ul className="mt-1 text-zinc-300">
                      {comp.strengths?.map((s, j) => (
                        <li key={j}>• {s}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <span className="text-red-400 text-xs">Weaknesses</span>
                    <ul className="mt-1 text-zinc-300">
                      {comp.weaknesses?.map((w, j) => (
                        <li key={j}>• {w}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Gap Analysis */}
        {gaps.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-white mb-3">Market Gaps</h3>
            <div className="space-y-2">
              {gaps.map((gap, i) => (
                <div key={i} className="p-3 bg-zinc-800/50 rounded-lg">
                  <p className="text-white text-sm">{gap.gap}</p>
                  <p className="text-purple-400 text-xs mt-1">{gap.opportunity}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Competitive Advantages */}
        {advantages.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-white mb-3">Your Advantages</h3>
            <ul className="space-y-1">
              {advantages.map((adv, i) => (
                <li key={i} className="text-sm text-zinc-300 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  {adv}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // Growth Experiments
  const experiments = (data.experiments as { name: string; hypothesis: string; priority: string; category: string }[]) || [];

  return (
    <div className="space-y-3">
      {experiments.map((exp, i) => (
        <div key={i} className="p-3 bg-zinc-800/50 rounded-lg">
          <div className="flex items-start justify-between">
            <h4 className="font-medium text-white">{exp.name}</h4>
            <span className={`text-xs px-2 py-0.5 rounded ${
              exp.priority === 'high'
                ? 'bg-red-500/20 text-red-400'
                : exp.priority === 'medium'
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-zinc-700 text-zinc-400'
            }`}>
              {exp.priority}
            </span>
          </div>
          <p className="text-sm text-zinc-300 mt-2">{exp.hypothesis}</p>
          <span className="text-xs text-purple-400 mt-2 inline-block">
            {exp.category}
          </span>
        </div>
      ))}
    </div>
  );
}

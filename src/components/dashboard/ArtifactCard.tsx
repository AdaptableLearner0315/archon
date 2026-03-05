'use client';

import { useState } from 'react';
import {
  FileText,
  Code,
  Target,
  PenTool,
  BarChart3,
  Mail,
  Package,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import type { ArtifactType } from '@/lib/types';

interface ArtifactCardProps {
  title: string;
  type: ArtifactType;
  agentName: string;
  preview: string;
  content: string;
  createdAt: string;
}

const typeConfig: Record<ArtifactType, { icon: React.ReactNode; color: string; label: string }> = {
  report: { icon: <FileText className="w-3.5 h-3.5" />, color: 'text-blue-400 bg-blue-400/10', label: 'Report' },
  code: { icon: <Code className="w-3.5 h-3.5" />, color: 'text-green-400 bg-green-400/10', label: 'Code' },
  strategy: { icon: <Target className="w-3.5 h-3.5" />, color: 'text-purple-400 bg-purple-400/10', label: 'Strategy' },
  content: { icon: <PenTool className="w-3.5 h-3.5" />, color: 'text-pink-400 bg-pink-400/10', label: 'Content' },
  analysis: { icon: <BarChart3 className="w-3.5 h-3.5" />, color: 'text-cyan-400 bg-cyan-400/10', label: 'Analysis' },
  email_draft: { icon: <Mail className="w-3.5 h-3.5" />, color: 'text-amber-400 bg-amber-400/10', label: 'Email Draft' },
  other: { icon: <Package className="w-3.5 h-3.5" />, color: 'text-gray-400 bg-gray-400/10', label: 'Output' },
};

export default function ArtifactCard({ title, type, agentName, preview, content, createdAt }: ArtifactCardProps) {
  const [expanded, setExpanded] = useState(false);
  const config = typeConfig[type] || typeConfig.other;

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  return (
    <>
      <div className="border border-border/60 rounded-lg bg-secondary/20 overflow-hidden">
        <div className="px-3 py-2.5">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${config.color}`}>
                {config.icon}
                {config.label}
              </span>
              <span className="text-xs font-semibold text-primary truncate">{agentName}</span>
              <span className="text-[10px] text-muted-foreground">{formatTime(createdAt)}</span>
            </div>
          </div>

          <p className="text-sm font-medium truncate">{title}</p>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{preview}</p>

          <button
            onClick={() => setExpanded(true)}
            className="flex items-center gap-1 mt-2 text-xs text-primary hover:text-primary/80 transition"
          >
            <ChevronDown className="w-3 h-3" />
            View full output
          </button>
        </div>
      </div>

      {/* Expanded modal */}
      {expanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setExpanded(false)} />
          <div className="relative w-full max-w-2xl max-h-[80vh] bg-card border border-border rounded-xl shadow-2xl overflow-hidden z-10">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${config.color}`}>
                  {config.icon}
                  {config.label}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{title}</p>
                  <p className="text-xs text-muted-foreground">by {agentName}</p>
                </div>
              </div>
              <button
                onClick={() => setExpanded(false)}
                className="p-1 text-muted-foreground hover:text-foreground transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal content */}
            <div className="p-5 overflow-y-auto max-h-[calc(80vh-64px)]">
              <div className="prose prose-invert prose-sm max-w-none">
                <pre className="whitespace-pre-wrap text-sm text-foreground/90 font-mono leading-relaxed bg-secondary/30 rounded-lg p-4">
                  {content}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

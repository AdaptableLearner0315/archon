'use client';

import { useState } from 'react';
import type { MemoryDomain } from '@/lib/types';
import { X, Brain } from 'lucide-react';

interface AddMemoryModalProps {
  domain: MemoryDomain;
  onClose: () => void;
  onAdd: (input: { topic: string; content: string; importance: number }) => void;
}

const DOMAIN_LABELS: Record<MemoryDomain, string> = {
  business_context: 'Business Context',
  competitors: 'Competitors',
  market: 'Market',
  agents: 'Agents',
};

export function AddMemoryModal({ domain, onClose, onAdd }: AddMemoryModalProps) {
  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [importance, setImportance] = useState(0.7);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || !content.trim()) return;

    setIsSubmitting(true);
    await onAdd({ topic: topic.trim(), content: content.trim(), importance });
    setIsSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/5 rounded-xl">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Add Memory</h2>
              <p className="text-sm text-white/50">
                Add to {DOMAIN_LABELS[domain]}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Topic */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Topic
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., Target Audience, Key Competitor, Market Trend"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-white/20"
              required
            />
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Content
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Describe the fact or insight you want to remember..."
              rows={4}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-white/20 resize-none"
              required
            />
          </div>

          {/* Importance */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Importance: {(importance * 100).toFixed(0)}%
            </label>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.1"
              value={importance}
              onChange={(e) => setImportance(parseFloat(e.target.value))}
              className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
            />
            <div className="flex justify-between text-xs text-white/30 mt-1">
              <span>Low</span>
              <span>Medium</span>
              <span>High</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 rounded-lg text-white/70 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!topic.trim() || !content.trim() || isSubmitting}
              className="flex-1 px-4 py-3 bg-white text-black rounded-lg font-medium hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Adding...' : 'Add Memory'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

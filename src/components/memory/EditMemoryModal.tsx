'use client';

import { useState } from 'react';
import type { CompanyMemory } from '@/lib/types';
import { X, Brain, AlertTriangle, Check } from 'lucide-react';

interface EditMemoryModalProps {
  memory: CompanyMemory;
  onClose: () => void;
  onSave: (updates: { topic: string; content: string; importance: number; confidence: number }) => Promise<void>;
}

export function EditMemoryModal({ memory, onClose, onSave }: EditMemoryModalProps) {
  const [topic, setTopic] = useState(memory.topic);
  const [content, setContent] = useState(memory.content);
  const [importance, setImportance] = useState(memory.importance);
  const [confidence, setConfidence] = useState(memory.confidence);
  const [acknowledged, setAcknowledged] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasChanges =
    topic !== memory.topic ||
    content !== memory.content ||
    importance !== memory.importance ||
    confidence !== memory.confidence;

  const canSave = hasChanges && acknowledged && topic.trim() && content.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;

    setIsSubmitting(true);
    await onSave({
      topic: topic.trim(),
      content: content.trim(),
      importance,
      confidence,
    });
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
      <div className="relative bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/5 rounded-xl">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Edit Memory</h2>
              <p className="text-sm text-white/50">
                {memory.domain.replace('_', ' ')}
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

        {/* Warning Banner */}
        <div className="mx-5 mt-5 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-amber-500">Impact Warning</h3>
              <p className="text-xs text-white/70 leading-relaxed">
                This memory is part of your AI organization&apos;s knowledge base.
                Modifying it will directly affect how your autonomous agents
                understand and operate your business.
              </p>
              <p className="text-xs text-white/50 leading-relaxed">
                Changes take effect immediately and may influence:
              </p>
              <ul className="text-xs text-white/50 space-y-1 ml-4 list-disc">
                <li>Agent decision-making and task execution</li>
                <li>Context used in future operating cycles</li>
                <li>Cross-domain insights and recommendations</li>
              </ul>
              <p className="text-xs text-white/60 mt-2">
                Please ensure your changes are accurate and intentional.
              </p>
            </div>
          </div>
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
              placeholder="Describe the fact or insight..."
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

          {/* Confidence */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Confidence: {(confidence * 100).toFixed(0)}%
            </label>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.1"
              value={confidence}
              onChange={(e) => setConfidence(parseFloat(e.target.value))}
              className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
            />
            <div className="flex justify-between text-xs text-white/30 mt-1">
              <span>Low</span>
              <span>Medium</span>
              <span>High</span>
            </div>
          </div>

          {/* Acknowledgment Checkbox */}
          <div className="pt-2">
            <label className="flex items-start gap-3 cursor-pointer group">
              <button
                type="button"
                onClick={() => setAcknowledged(!acknowledged)}
                className={`flex-shrink-0 w-5 h-5 rounded border transition-colors mt-0.5 ${
                  acknowledged
                    ? 'bg-amber-500 border-amber-500'
                    : 'bg-transparent border-white/30 group-hover:border-white/50'
                }`}
              >
                {acknowledged && (
                  <Check className="w-full h-full text-black p-0.5" />
                )}
              </button>
              <span className="text-sm text-white/60 leading-relaxed">
                I understand this change will affect my autonomous AI system
              </span>
            </label>
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
              disabled={!canSave || isSubmitting}
              className="flex-1 px-4 py-3 bg-white text-black rounded-lg font-medium hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

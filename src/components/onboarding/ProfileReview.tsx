'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Edit2,
  Check,
  Building2,
  Target,
  Users,
  Sparkles,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  ArrowLeft,
  Loader2,
} from 'lucide-react';

export interface ExtractedProfile {
  businessIdea?: string;
  businessIdeaSummary?: string;
  businessType?: 'saas' | 'creator' | 'services' | 'ecommerce';
  targetAudience?: { primary: string; painPoints?: string[] };
  competitors?: { name: string; strengths?: string[]; weaknesses?: string[]; weakness?: string }[];
  uniqueValueProp?: string;
  keyFeatures?: string[];
  brandTone?: 'professional' | 'casual' | 'playful' | 'technical';
  stage?: 'idea' | 'mvp' | 'launched' | 'revenue';
  teamSize?: number;
  founderSkills?: string[];
  workingStyle?: 'move-fast' | 'balanced' | 'methodical';
}

interface ProfileReviewProps {
  profile: ExtractedProfile;
  onConfirm: (profile: ExtractedProfile) => void;
  onBack: () => void;
  isLoading?: boolean;
}

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  saas: 'SaaS',
  creator: 'Creator Economy',
  services: 'Services',
  ecommerce: 'E-commerce',
};

const STAGE_LABELS: Record<string, string> = {
  idea: 'Idea Stage',
  mvp: 'MVP',
  launched: 'Launched',
  revenue: 'Generating Revenue',
};

const TONE_LABELS: Record<string, string> = {
  professional: 'Professional',
  casual: 'Casual',
  playful: 'Playful',
  technical: 'Technical',
};

function EditableField({
  label,
  value,
  onSave,
  multiline = false,
  icon: Icon,
}: {
  label: string;
  value: string;
  onSave: (value: string) => void;
  multiline?: boolean;
  icon?: typeof Building2;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);

  const handleSave = () => {
    onSave(editValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  return (
    <div className="group">
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className="w-4 h-4 text-white/40" />}
        <span className="text-xs text-white/50 uppercase tracking-wider">{label}</span>
      </div>
      {isEditing ? (
        <div className="space-y-2">
          {multiline ? (
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full px-3 py-2 bg-white/[0.06] border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-white/40 resize-none"
              rows={3}
              autoFocus
            />
          ) : (
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full px-3 py-2 bg-white/[0.06] border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-white/40"
              autoFocus
            />
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              className="px-3 py-1.5 bg-white text-black text-xs font-medium rounded-lg hover:bg-white/90 transition-colors"
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 bg-white/[0.06] text-white/60 text-xs rounded-lg hover:bg-white/[0.1] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <p className="text-white text-sm leading-relaxed">
            {value || <span className="text-white/30 italic">Not specified</span>}
          </p>
          <button
            onClick={() => setIsEditing(true)}
            className="p-1.5 text-white/30 hover:text-white/60 hover:bg-white/[0.06] rounded-lg transition-colors opacity-0 group-hover:opacity-100"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onSave,
  icon: Icon,
}: {
  label: string;
  value: T;
  options: Record<T, string>;
  onSave: (value: T) => void;
  icon?: typeof Building2;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="group">
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className="w-4 h-4 text-white/40" />}
        <span className="text-xs text-white/50 uppercase tracking-wider">{label}</span>
      </div>
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-white text-sm hover:border-white/20 transition-colors"
        >
          <span>{options[value] || value}</span>
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-white/40" />
          ) : (
            <ChevronDown className="w-4 h-4 text-white/40" />
          )}
        </button>
        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-white/10 rounded-lg overflow-hidden z-10 shadow-xl">
            {Object.entries(options).map(([key, label]) => (
              <button
                key={key}
                onClick={() => {
                  onSave(key as T);
                  setIsOpen(false);
                }}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-white/[0.06] transition-colors ${
                  key === value ? 'text-white bg-white/[0.04]' : 'text-white/70'
                }`}
              >
                {label as string}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ListField({
  label,
  items,
  onSave,
  icon: Icon,
}: {
  label: string;
  items: string[];
  onSave: (items: string[]) => void;
  icon?: typeof Building2;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(items.join(', '));

  const handleSave = () => {
    const newItems = editValue.split(',').map((s) => s.trim()).filter(Boolean);
    onSave(newItems);
    setIsEditing(false);
  };

  return (
    <div className="group">
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className="w-4 h-4 text-white/40" />}
        <span className="text-xs text-white/50 uppercase tracking-wider">{label}</span>
      </div>
      {isEditing ? (
        <div className="space-y-2">
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            placeholder="Item 1, Item 2, Item 3"
            className="w-full px-3 py-2 bg-white/[0.06] border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-white/40"
            autoFocus
          />
          <p className="text-xs text-white/30">Separate items with commas</p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              className="px-3 py-1.5 bg-white text-black text-xs font-medium rounded-lg hover:bg-white/90 transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => {
                setEditValue(items.join(', '));
                setIsEditing(false);
              }}
              className="px-3 py-1.5 bg-white/[0.06] text-white/60 text-xs rounded-lg hover:bg-white/[0.1] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {items.length > 0 ? (
              items.map((item, i) => (
                <span
                  key={i}
                  className="px-2 py-1 bg-white/[0.06] rounded-lg text-xs text-white/80"
                >
                  {item}
                </span>
              ))
            ) : (
              <span className="text-white/30 italic text-sm">Not specified</span>
            )}
          </div>
          <button
            onClick={() => setIsEditing(true)}
            className="p-1.5 text-white/30 hover:text-white/60 hover:bg-white/[0.06] rounded-lg transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export function ProfileReview({ profile, onConfirm, onBack, isLoading }: ProfileReviewProps) {
  const [editedProfile, setEditedProfile] = useState<ExtractedProfile>(profile);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updateProfile = <K extends keyof ExtractedProfile>(key: K, value: ExtractedProfile[K]) => {
    setEditedProfile((prev) => ({ ...prev, [key]: value }));
  };

  const hasMinimumInfo = editedProfile.businessIdea || editedProfile.businessIdeaSummary;

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-white/[0.06] rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-white/60" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-white">Review Your Profile</h2>
            <p className="text-xs text-white/50">
              Here&apos;s what Atlas learned about you. Click any field to edit.
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {/* Core Info */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <EditableField
            label="Business / Product"
            value={editedProfile.businessIdea || ''}
            onSave={(v) => updateProfile('businessIdea', v)}
            multiline
            icon={Building2}
          />

          <EditableField
            label="Short Name"
            value={editedProfile.businessIdeaSummary || ''}
            onSave={(v) => updateProfile('businessIdeaSummary', v)}
            icon={Sparkles}
          />

          <div className="grid grid-cols-2 gap-4">
            <SelectField
              label="Business Type"
              value={editedProfile.businessType || 'saas'}
              options={BUSINESS_TYPE_LABELS as Record<NonNullable<ExtractedProfile['businessType']>, string>}
              onSave={(v) => updateProfile('businessType', v)}
              icon={Building2}
            />

            <SelectField
              label="Stage"
              value={editedProfile.stage || 'idea'}
              options={STAGE_LABELS as Record<NonNullable<ExtractedProfile['stage']>, string>}
              onSave={(v) => updateProfile('stage', v)}
              icon={Target}
            />
          </div>
        </motion.div>

        {/* Target Audience */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-4"
        >
          <EditableField
            label="Target Audience"
            value={editedProfile.targetAudience?.primary || ''}
            onSave={(v) =>
              updateProfile('targetAudience', {
                ...editedProfile.targetAudience,
                primary: v,
              })
            }
            icon={Users}
          />

          <ListField
            label="Customer Pain Points"
            items={editedProfile.targetAudience?.painPoints || []}
            onSave={(items) =>
              updateProfile('targetAudience', {
                ...editedProfile.targetAudience,
                primary: editedProfile.targetAudience?.primary || '',
                painPoints: items,
              })
            }
          />
        </motion.div>

        {/* Value Prop & Features */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-4"
        >
          <EditableField
            label="Unique Value Proposition"
            value={editedProfile.uniqueValueProp || ''}
            onSave={(v) => updateProfile('uniqueValueProp', v)}
            multiline
          />

          <ListField
            label="Key Features"
            items={editedProfile.keyFeatures || []}
            onSave={(items) => updateProfile('keyFeatures', items)}
          />
        </motion.div>

        {/* Advanced Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm text-white/50 hover:text-white/70 transition-colors"
          >
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {showAdvanced ? 'Hide' : 'Show'} advanced options
          </button>

          {showAdvanced && (
            <div className="mt-4 space-y-4 p-4 bg-white/[0.02] rounded-xl border border-white/[0.06]">
              <SelectField
                label="Brand Tone"
                value={editedProfile.brandTone || 'casual'}
                options={TONE_LABELS as Record<NonNullable<ExtractedProfile['brandTone']>, string>}
                onSave={(v) => updateProfile('brandTone', v)}
                icon={MessageSquare}
              />

              {/* Competitors */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-4 h-4 text-white/40" />
                  <span className="text-xs text-white/50 uppercase tracking-wider">Competitors</span>
                </div>
                <div className="space-y-2">
                  {(editedProfile.competitors || []).map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="text-white">{c.name}</span>
                      {c.weakness && (
                        <span className="text-white/50">- {c.weakness}</span>
                      )}
                    </div>
                  ))}
                  {(!editedProfile.competitors || editedProfile.competitors.length === 0) && (
                    <span className="text-white/30 italic text-sm">None identified</span>
                  )}
                </div>
              </div>

              <ListField
                label="Founder Skills"
                items={editedProfile.founderSkills || []}
                onSave={(items) => updateProfile('founderSkills', items)}
              />
            </div>
          )}
        </motion.div>

        {/* Warning if minimal info */}
        {!hasMinimumInfo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl"
          >
            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-amber-400 font-medium">Missing business information</p>
              <p className="text-xs text-white/60 mt-1">
                Please add at least a business description so your AI team can help effectively.
              </p>
            </div>
          </motion.div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-white/[0.06]">
        <button
          onClick={() => onConfirm(editedProfile)}
          disabled={isLoading || !hasMinimumInfo}
          className="w-full py-3 bg-white text-black font-semibold rounded-xl hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Creating your AI team...
            </>
          ) : (
            <>
              <Check className="w-5 h-5" />
              Looks Good, Let&apos;s Go!
            </>
          )}
        </button>
        <p className="text-center text-xs text-white/30 mt-2">
          You can always update this later in Settings
        </p>
      </div>
    </div>
  );
}

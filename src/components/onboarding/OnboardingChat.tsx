'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2, ArrowRight, Sparkles, Dice5 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ChatMessage, TypingIndicator } from './ChatMessage';
import { VoiceButton } from './VoiceButton';
import { InfrastructureProgress } from './InfrastructureProgress';
import { ProfileReview, ExtractedProfile } from './ProfileReview';
import { MemoryBubbles, MemoryInsight } from './MemoryBubble';
import type { ConversationPhase } from '@/lib/onboarding/conversation-engine';

const CONVERSATION_STORAGE_KEY = 'archon_onboarding_conversation';
const MAX_REROLLS = 3;

export interface Message {
  id: string;
  role: 'atlas' | 'user';
  content: string;
}

interface SurpriseConcept {
  companyName: string;
  businessDescription: string;
  businessType: string;
  targetAudience: { primary: string; painPoints: string[] };
  competitors: { name: string; weakness: string }[];
  keyFeatures: string[];
  uniqueValueProp: string;
  brandTone: string;
}

interface OnboardingChatProps {
  onComplete: (profile: Record<string, unknown>) => void;
}

function stripMarkers(text: string): string {
  return text
    .replace(/\[COMPLETE\]/g, '')
    .replace(/\[INSIGHT:[^\]]*\]/g, '')
    .replace(/\[CREDITS:[^\]]*\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="px-4 py-3 border-b border-white/[0.06]">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-white/50">Getting to know you</span>
        <span className="text-xs text-white/30">{progress}%</span>
      </div>
      <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-white rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

// Concept Reveal Screen — shown after the Surprise Me API returns
function ConceptReveal({
  concept,
  rerollCount,
  onConfirm,
  onReroll,
  isLoading,
}: {
  concept: SurpriseConcept;
  rerollCount: number;
  onConfirm: () => void;
  onReroll: () => void;
  isLoading: boolean;
}) {
  const [step, setStep] = useState<'reveal' | 'validate'>('reveal');
  const [validated, setValidated] = useState(false);

  const handleProceedToValidate = () => {
    setStep('validate');
  };

  const handleValidateAndConfirm = () => {
    setValidated(true);
    onConfirm();
  };

  // Validation step - quick confirmation of key details
  if (step === 'validate') {
    return (
      <div className="flex flex-col h-full p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md mx-auto w-full"
        >
          <h2 className="text-xl font-semibold text-white mb-6">Quick check before we begin</h2>

          <div className="space-y-4 mb-8">
            <div className="p-4 bg-white/[0.04] border border-white/[0.08] rounded-xl">
              <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Business Type</p>
              <p className="text-white">{concept.businessType}</p>
            </div>

            <div className="p-4 bg-white/[0.04] border border-white/[0.08] rounded-xl">
              <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Target Audience</p>
              <p className="text-white">{concept.targetAudience.primary}</p>
            </div>

            {concept.targetAudience.painPoints && concept.targetAudience.painPoints.length > 0 && (
              <div className="p-4 bg-white/[0.04] border border-white/[0.08] rounded-xl">
                <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Problems We&apos;ll Solve</p>
                <ul className="text-white/80 text-sm space-y-1">
                  {concept.targetAudience.painPoints.slice(0, 2).map((point, i) => (
                    <li key={i}>• {point}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <p className="text-sm text-white/50 mb-6 text-center">
            Does this sound like something you&apos;d want to build?
          </p>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleValidateAndConfirm}
              disabled={isLoading}
              className="w-full py-3 bg-white text-black font-semibold rounded-xl hover:bg-white/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating your AI team...
                </>
              ) : (
                "Yes, let's build this!"
              )}
            </button>

            <button
              onClick={() => setStep('reveal')}
              disabled={isLoading}
              className="w-full py-2.5 text-white/60 text-sm hover:text-white/80 transition-colors disabled:opacity-50"
            >
              Go back
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Initial reveal step
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full"
      >
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-white/50 text-sm mb-4"
        >
          Meet your new company
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="text-4xl font-bold text-white mb-4"
        >
          {concept.companyName}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="text-white/60 text-base mb-8 leading-relaxed"
        >
          {concept.businessDescription}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="flex items-center justify-center gap-3"
        >
          <button
            onClick={handleProceedToValidate}
            disabled={isLoading}
            className="px-8 py-3 bg-white text-black font-semibold rounded-xl hover:bg-white/90 transition-colors disabled:opacity-50"
          >
            Love it, let&apos;s build!
          </button>

          {rerollCount < MAX_REROLLS && (
            <button
              onClick={onReroll}
              disabled={isLoading}
              className="px-5 py-3 bg-white/[0.06] text-white/70 font-medium rounded-xl hover:bg-white/[0.1] transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <Dice5 className="w-4 h-4" />
              Re-roll
            </button>
          )}
        </motion.div>

        {rerollCount > 0 && rerollCount < MAX_REROLLS && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-white/20 text-xs mt-4"
          >
            {MAX_REROLLS - rerollCount} re-roll{MAX_REROLLS - rerollCount !== 1 ? 's' : ''} remaining
          </motion.p>
        )}
      </motion.div>
    </div>
  );
}

// Surprise loading animation
function SurpriseLoading() {
  const messages = [
    'Atlas is dreaming up a business for you...',
    'Exploring creative possibilities...',
    'Finding the perfect idea...',
    'Almost there...',
  ];
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full p-6">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        className="w-12 h-12 rounded-full border-2 border-white/10 border-t-white mb-6"
      />
      <AnimatePresence mode="wait">
        <motion.p
          key={messageIndex}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          className="text-white/50 text-sm"
        >
          {messages[messageIndex]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

export function OnboardingChat({ onComplete }: OnboardingChatProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<ConversationPhase>('welcome');
  const [progress, setProgress] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [showDashboardCTA, setShowDashboardCTA] = useState(false);
  const [showInfrastructureProgress, setShowInfrastructureProgress] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);

  // Surprise Me state
  const [surpriseLoading, setSurpriseLoading] = useState(false);
  const [surpriseConcept, setSurpriseConcept] = useState<SurpriseConcept | null>(null);
  const [surpriseConfirming, setSurpriseConfirming] = useState(false);
  const [rerollCount, setRerollCount] = useState(0);
  const [completionProfileData, setCompletionProfileData] = useState<Record<string, unknown> | null>(null);

  // Profile Review state
  const [showProfileReview, setShowProfileReview] = useState(false);
  const [extractedProfile, setExtractedProfile] = useState<ExtractedProfile | null>(null);
  const [isExtractingProfile, setIsExtractingProfile] = useState(false);
  const [isConfirmingProfile, setIsConfirmingProfile] = useState(false);

  // Memory feedback state
  const [capturedInsights, setCapturedInsights] = useState<MemoryInsight[]>([]);

  // Session recovery toast state
  const [showSessionRecoveryToast, setShowSessionRecoveryToast] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const completionCalledRef = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  useEffect(() => {
    if (messages.length > 0) {
      try {
        sessionStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify({
          messages,
          phase: currentPhase,
          progress,
          timestamp: Date.now(),
        }));
      } catch {
        // Ignore storage errors
      }
    }
  }, [messages, currentPhase, progress]);

  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const initChat = async () => {
      try {
        const stored = sessionStorage.getItem(CONVERSATION_STORAGE_KEY);
        if (stored) {
          const { messages: storedMessages, phase, progress: storedProgress, timestamp } = JSON.parse(stored);
          if (Date.now() - timestamp < 30 * 60 * 1000 && storedMessages.length > 0) {
            setMessages(storedMessages);
            setCurrentPhase(phase);
            setProgress(storedProgress || 0);
            // Show session recovery toast
            setShowSessionRecoveryToast(true);
            setTimeout(() => setShowSessionRecoveryToast(false), 4000);
            return;
          }
        }
      } catch {
        // Ignore restore errors
      }

      setIsLoading(true);
      await streamAtlasMessage(
        `Hey! I'm Atlas. I'd love to learn a bit about what you're building so I can set things up for you. What's your business or product about?`
      );
      setIsLoading(false);
    };

    initChat();
  }, []);

  const streamAtlasMessage = async (content: string) => {
    const messageId = crypto.randomUUID();
    setIsStreaming(true);

    setMessages((prev) => [...prev, { id: messageId, role: 'atlas', content: '' }]);

    const words = content.split(' ');
    let accumulated = '';

    for (let i = 0; i < words.length; i++) {
      accumulated += (i === 0 ? '' : ' ') + words[i];
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, content: accumulated } : m))
      );
      await new Promise((r) => setTimeout(r, 20 + Math.random() * 30));
    }

    setIsStreaming(false);

    if (voiceEnabled && 'speechSynthesis' in window) {
      setIsSpeaking(true);
      const utterance = new SpeechSynthesisUtterance(content.replace(/\*\*/g, ''));
      utterance.rate = 1.1;
      utterance.onend = () => setIsSpeaking(false);
      speechSynthesis.speak(utterance);
    }

    return messageId;
  };

  const handleSurpriseMe = async () => {
    setSurpriseLoading(true);
    setSurpriseConcept(null);

    try {
      const response = await fetch('/api/onboarding/surprise', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to generate concept');
      }

      const data = await response.json();
      setSurpriseConcept(data.concept);
    } catch (error) {
      console.error('Surprise Me error:', error);
      // Fall back — go back to chat
      setSurpriseLoading(false);
    } finally {
      setSurpriseLoading(false);
    }
  };

  const handleSurpriseConfirm = async () => {
    if (!surpriseConcept) return;
    setSurpriseConfirming(true);

    try {
      const response = await fetch('/api/onboarding/surprise/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concept: surpriseConcept }),
      });

      if (!response.ok) {
        throw new Error('Failed to create company');
      }

      const data = await response.json();
      sessionStorage.removeItem(CONVERSATION_STORAGE_KEY);
      setCompanyId(data.companyId);
      setCompletionProfileData(data.profile || null);
      setShowInfrastructureProgress(true);
      setSurpriseConcept(null);
      // DO NOT call onComplete() here — let InfrastructureProgress handle navigation
    } catch (error) {
      console.error('Surprise confirm error:', error);
      setSurpriseConfirming(false);
    }
  };

  const handleReroll = async () => {
    setRerollCount((prev) => prev + 1);
    setSurpriseLoading(true);
    setSurpriseConcept(null);

    try {
      const response = await fetch('/api/onboarding/surprise', {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to generate concept');

      const data = await response.json();
      setSurpriseConcept(data.concept);
    } catch (error) {
      console.error('Re-roll error:', error);
    } finally {
      setSurpriseLoading(false);
    }
  };

  const handleGoToDashboard = () => {
    sessionStorage.removeItem(CONVERSATION_STORAGE_KEY);
    router.push('/dashboard');
  };

  const handleProfileConfirm = async (editedProfile: ExtractedProfile) => {
    setIsConfirmingProfile(true);

    try {
      const completeResponse = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationHistory: messages.map((m) => ({
            role: m.role === 'atlas' ? 'assistant' : 'user',
            content: m.content,
          })),
          selectedPackage: null,
          // Pass the edited profile to be used directly
          editedProfile,
        }),
      });

      if (completeResponse.ok) {
        const data = await completeResponse.json();
        sessionStorage.removeItem(CONVERSATION_STORAGE_KEY);
        setCompanyId(data.companyId);
        setCompletionProfileData(data.profile || editedProfile);
        setShowProfileReview(false);
        setShowInfrastructureProgress(true);
      } else {
        console.error('Failed to complete onboarding:', await completeResponse.text());
        setIsConfirmingProfile(false);
      }
    } catch (err) {
      console.error('Error completing onboarding:', err);
      setIsConfirmingProfile(false);
    }
  };

  const handleProfileBack = () => {
    setShowProfileReview(false);
    setIsComplete(false);
    completionCalledRef.current = false;
  };

  const handleSend = useCallback(async () => {
    const text = inputValue.trim() || interimTranscript.trim();
    if (!text || isLoading || isStreaming || isComplete) return;

    setInputValue('');
    setInterimTranscript('');
    setIsListening(false);

    const userMessageId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: userMessageId, role: 'user', content: text }]);

    setIsLoading(true);

    try {
      const response = await fetch('/api/onboarding/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          phase: currentPhase,
          currentProgress: progress,
          conversationHistory: messages.map((m) => ({
            role: m.role === 'atlas' ? 'assistant' : 'user',
            content: m.content,
          })),
        }),
      });

      if (!response.ok) throw new Error('Failed to get response');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let atlasContent = '';
      let cleanContent = '';
      let newPhase: ConversationPhase = currentPhase;
      let newProgress = progress;
      let completionProfile: Record<string, unknown> | null = null;

      const atlasMessageId = crypto.randomUUID();
      setMessages((prev) => [...prev, { id: atlasMessageId, role: 'atlas', content: '' }]);
      setIsStreaming(true);

      let sseBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });

        let boundary = sseBuffer.indexOf('\n\n');
        while (boundary !== -1) {
          const message = sseBuffer.slice(0, boundary);
          sseBuffer = sseBuffer.slice(boundary + 2);

          const lines = message.split('\n').filter((line) => line.startsWith('data: '));

          for (const line of lines) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);

              if (parsed.type === 'text') {
                atlasContent += parsed.content;
                const displayContent = stripMarkers(atlasContent);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === atlasMessageId ? { ...m, content: displayContent } : m
                  )
                );
              } else if (parsed.type === 'clean_response') {
                cleanContent = parsed.content;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === atlasMessageId ? { ...m, content: cleanContent } : m
                  )
                );
              } else if (parsed.type === 'progress') {
                newProgress = parsed.progress;
                setProgress(newProgress);
              } else if (parsed.type === 'phase') {
                newPhase = parsed.phase;
              } else if (parsed.type === 'complete') {
                completionProfile = parsed.profile;
              } else if (parsed.type === 'insights') {
                // Update captured insights for memory feedback UI
                setCapturedInsights(parsed.insights || []);
              }
            } catch {
              // Ignore parse errors
            }
          }

          boundary = sseBuffer.indexOf('\n\n');
        }
      }

      setCurrentPhase(newPhase);
      setIsStreaming(false);

      const spokenContent = cleanContent || stripMarkers(atlasContent);

      if (voiceEnabled && 'speechSynthesis' in window) {
        setIsSpeaking(true);
        const utterance = new SpeechSynthesisUtterance(spokenContent.replace(/\*\*/g, ''));
        utterance.rate = 1.1;
        utterance.onend = () => setIsSpeaking(false);
        speechSynthesis.speak(utterance);
      }

      if (completionProfile && !completionCalledRef.current) {
        completionCalledRef.current = true;
        setIsComplete(true);
        setIsExtractingProfile(true);

        // Extract profile for review instead of completing directly
        try {
          const extractResponse = await fetch('/api/onboarding/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conversationHistory: [...messages, { role: 'user', content: text }, { role: 'atlas', content: spokenContent }].map((m) => ({
                role: m.role === 'atlas' ? 'assistant' : 'user',
                content: m.content,
              })),
            }),
          });

          if (extractResponse.ok) {
            const data = await extractResponse.json();
            setExtractedProfile(data.profile);
            setShowProfileReview(true);
          } else {
            console.error('Failed to extract profile:', await extractResponse.text());
            completionCalledRef.current = false;
            setIsComplete(false);
          }
        } catch (err) {
          console.error('Error extracting profile:', err);
          completionCalledRef.current = false;
          setIsComplete(false);
        } finally {
          setIsExtractingProfile(false);
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      await streamAtlasMessage(
        "I apologize, but I encountered an issue. Could you please try again?"
      );
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, interimTranscript, isLoading, isStreaming, isComplete, currentPhase, progress, messages, voiceEnabled]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleVoiceTranscript = useCallback((text: string) => {
    setInputValue((prev) => prev + (prev ? ' ' : '') + text);
    setInterimTranscript('');
  }, []);

  // Show profile extraction loading
  if (isExtractingProfile) {
    return (
      <div className="flex flex-col h-full max-h-[calc(100vh-8rem)] items-center justify-center p-6">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="w-12 h-12 rounded-full border-2 border-white/10 border-t-white mb-6"
        />
        <p className="text-white/50 text-sm">Analyzing your conversation...</p>
      </div>
    );
  }

  // Show profile review
  if (showProfileReview && extractedProfile) {
    return (
      <ProfileReview
        profile={extractedProfile}
        onConfirm={handleProfileConfirm}
        onBack={handleProfileBack}
        isLoading={isConfirmingProfile}
      />
    );
  }

  // Show infrastructure progress
  if (showInfrastructureProgress && companyId) {
    return (
      <div className="flex flex-col h-full max-h-[calc(100vh-8rem)] items-center justify-center p-6">
        <InfrastructureProgress
          companyId={companyId}
          profile={completionProfileData || undefined}
          onComplete={() => {
            onComplete(completionProfileData || {});
          }}
          onError={(error) => {
            console.error('Infrastructure generation error:', error);
            onComplete(completionProfileData || {});
          }}
          onSkip={() => {
            // Skip infrastructure generation and go directly to dashboard
            onComplete(completionProfileData || {});
          }}
        />
      </div>
    );
  }

  // Show Surprise Me loading animation
  if (surpriseLoading && !surpriseConcept) {
    return (
      <div className="flex flex-col h-full max-h-[calc(100vh-8rem)]">
        <SurpriseLoading />
      </div>
    );
  }

  // Show Concept Reveal screen
  if (surpriseConcept) {
    return (
      <div className="flex flex-col h-full max-h-[calc(100vh-8rem)]">
        <ConceptReveal
          concept={surpriseConcept}
          rerollCount={rerollCount}
          onConfirm={handleSurpriseConfirm}
          onReroll={handleReroll}
          isLoading={surpriseConfirming}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-8rem)]">
      {/* Session recovery toast */}
      <AnimatePresence>
        {showSessionRecoveryToast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-white/[0.08] backdrop-blur-xl border border-white/[0.12] rounded-xl shadow-xl"
          >
            <p className="text-sm text-white/80">
              Welcome back! Resuming your conversation...
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress bar */}
      <ProgressBar progress={progress} />

      {/* Memory feedback - captured insights */}
      {capturedInsights.length > 0 && (
        <div className="px-4 pt-4">
          <MemoryBubbles insights={capturedInsights} />
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.map((message) => (
          <div key={message.id}>
            <ChatMessage
              role={message.role}
              content={message.content}
              isStreaming={isStreaming && message === messages[messages.length - 1] && message.role === 'atlas'}
            />
          </div>
        ))}

        {isLoading && !isStreaming && <TypingIndicator />}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area or Dashboard CTA */}
      <div className="px-4 pb-6">
        {showDashboardCTA ? (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={handleGoToDashboard}
            className="w-full py-4 bg-white text-black hover:bg-white/90 font-semibold rounded-2xl flex items-center justify-center gap-2 transition-all"
          >
            Go to Dashboard
            <ArrowRight className="w-5 h-5" />
          </motion.button>
        ) : (
          <div className="glass rounded-2xl p-3">
            {/* Voice mode toggle */}
            <div className="flex items-center justify-between mb-2 px-1">
              <button
                onClick={() => setVoiceEnabled(!voiceEnabled)}
                className={`text-xs transition-colors ${
                  voiceEnabled ? 'text-white' : 'text-white/30 hover:text-white/50'
                }`}
              >
                {voiceEnabled ? 'Voice mode on' : 'Enable voice mode'}
              </button>
              <span className="text-[10px] text-white/20">
                Press Enter to send
              </span>
            </div>

            <div className="flex items-end gap-3">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={inputValue || interimTranscript}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    setInterimTranscript('');
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your message..."
                  rows={1}
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.06] rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 resize-none max-h-32"
                  style={{ minHeight: '48px' }}
                />
                {interimTranscript && (
                  <span className="absolute right-3 bottom-3 text-xs text-white/30">
                    listening...
                  </span>
                )}
              </div>

              {voiceEnabled && (
                <VoiceButton
                  onTranscript={handleVoiceTranscript}
                  onInterimTranscript={setInterimTranscript}
                  isListening={isListening}
                  setIsListening={setIsListening}
                  isSpeaking={isSpeaking}
                  disabled={isLoading || isStreaming}
                />
              )}

              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleSend}
                disabled={(!inputValue.trim() && !interimTranscript.trim()) || isLoading || isStreaming || isComplete}
                className="w-12 h-12 bg-white text-black rounded-xl flex items-center justify-center hover:bg-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </motion.button>
            </div>

            {/* Surprise Me button */}
            <div className="mt-3 text-center">
              <button
                onClick={handleSurpriseMe}
                disabled={isLoading || isStreaming}
                className="inline-flex items-center gap-1.5 text-xs text-white/30 hover:text-white/50 transition-colors disabled:opacity-30"
              >
                <Sparkles className="w-3 h-3" />
                Surprise Me — let AI decide
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

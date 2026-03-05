'use client';

import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';

export interface ChatMessageProps {
  role: 'atlas' | 'user';
  content: string;
  isStreaming?: boolean;
  children?: React.ReactNode;
}

export function ChatMessage({ role, content, isStreaming, children }: ChatMessageProps) {
  const isAtlas = role === 'atlas';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex gap-3 ${isAtlas ? 'justify-start' : 'justify-end'}`}
    >
      {isAtlas && (
        <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center flex-shrink-0 border border-white/[0.06]">
          <Zap className="w-4 h-4 text-white" />
        </div>
      )}

      <div
        className={`max-w-[80%] ${
          isAtlas
            ? 'glass rounded-2xl rounded-tl-md px-4 py-3'
            : 'bg-white/[0.06] border border-white/[0.08] rounded-2xl rounded-tr-md px-4 py-3'
        }`}
      >
        <div className="text-sm text-white/90 whitespace-pre-wrap leading-relaxed">
          {content}
          {isStreaming && (
            <span className="inline-block w-1.5 h-4 bg-white/50 ml-0.5 animate-pulse" />
          )}
        </div>
        {children}
      </div>
    </motion.div>
  );
}

export function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-3 justify-start"
    >
      <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center flex-shrink-0 border border-white/[0.06]">
        <Zap className="w-4 h-4 text-white" />
      </div>
      <div className="glass rounded-2xl rounded-tl-md px-4 py-3">
        <div className="flex items-center gap-1.5">
          <motion.span
            className="w-2 h-2 bg-white/30 rounded-full"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: 0 }}
          />
          <motion.span
            className="w-2 h-2 bg-white/30 rounded-full"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }}
          />
          <motion.span
            className="w-2 h-2 bg-white/30 rounded-full"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }}
          />
        </div>
      </div>
    </motion.div>
  );
}

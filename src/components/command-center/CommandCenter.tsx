'use client';

import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { Send, Loader2, MessageSquare, Sparkles } from 'lucide-react';
import type { AgentRole } from '@/lib/types';

interface CommandCenterProps {
  companyId: string;
  companyName: string;
}

const AGENT_COLORS: Partial<Record<AgentRole, string>> = {
  ceo: 'text-yellow-400',
  engineer: 'text-blue-400',
  growth: 'text-green-400',
  marketing: 'text-pink-400',
  product: 'text-purple-400',
  operations: 'text-orange-400',
  sales: 'text-cyan-400',
  support: 'text-indigo-400',
  'data-analyst': 'text-emerald-400',
  'customer-success': 'text-rose-400',
};

export default function CommandCenter({ companyId, companyName }: CommandCenterProps) {
  const { messages, addMessage, isCommandLoading, setCommandLoading, addActivity, updateAgentStatus } = useAppStore();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const directive = input.trim();
    if (!directive || isCommandLoading) return;

    setInput('');
    addMessage({ role: 'user', content: directive });
    setCommandLoading(true);

    try {
      const res = await fetch('/api/agents/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directive,
          companyId,
          companyName,
        }),
      });

      if (!res.ok) throw new Error('Failed to execute');

      // Handle streaming response
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                if (parsed.text) {
                  fullText += parsed.text;
                }
                if (parsed.agent) {
                  // Agent identified in response
                  updateAgentStatus(parsed.agent.role, 'working', `Responding to: "${directive.slice(0, 50)}"`);
                }
              } catch {
                // Not JSON, treat as text
                fullText += data;
              }
            }
          }
        }
      }

      // Parse agent responses from full text
      const agentPattern = /\*\*(\w+):\*\*\s*([\s\S]*?)(?=\*\*\w+:\*\*|$)/g;
      let match;
      let hasAgent = false;

      while ((match = agentPattern.exec(fullText)) !== null) {
        hasAgent = true;
        const agentName = match[1];
        const content = match[2].trim();

        const roleMap: Record<string, AgentRole> = {
          Atlas: 'ceo', Forge: 'engineer', Pulse: 'growth', Echo: 'marketing',
          Prism: 'product', Nexus: 'operations', Arrow: 'sales', Shield: 'support',
          Lens: 'data-analyst', Bloom: 'customer-success',
        };

        const role = roleMap[agentName] || 'ceo';

        addMessage({
          role: 'agent',
          agentRole: role,
          agentName,
          content,
        });

        addActivity({
          agentRole: role,
          agentName,
          action: `Responded to directive`,
          detail: content.slice(0, 120) + (content.length > 120 ? '...' : ''),
          type: 'action',
        });

        updateAgentStatus(role, 'completed', content.slice(0, 60));
      }

      if (!hasAgent && fullText) {
        addMessage({
          role: 'agent',
          agentRole: 'ceo',
          agentName: 'Atlas',
          content: fullText,
        });
      }
    } catch (error) {
      addMessage({
        role: 'agent',
        agentRole: 'ceo',
        agentName: 'System',
        content: 'Sorry, I encountered an error processing your directive. Please try again.',
      });
    } finally {
      setCommandLoading(false);
    }
  };

  return (
    <aside className="fixed top-14 right-0 bottom-0 w-[420px] border-l border-border bg-background flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold">Command Center</h2>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Direct your AI organization with natural language
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <p className="text-sm font-medium mb-1">Your agents are ready</p>
            <p className="text-xs text-muted-foreground max-w-[240px]">
              Type a directive to command your AI organization. Try: &quot;Focus on getting our first 100 users from Reddit&quot;
            </p>
            <div className="mt-4 space-y-2 w-full">
              {[
                'Analyze our top competitors',
                'Draft a launch strategy for ProductHunt',
                'Write 5 cold email templates',
                'Create a content calendar for this month',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  className="w-full text-left px-3 py-2 text-xs bg-secondary/50 rounded-lg hover:bg-secondary transition text-muted-foreground hover:text-foreground"
                >
                  &quot;{suggestion}&quot;
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className="fade-in">
            {msg.role === 'user' ? (
              <div className="flex justify-end">
                <div className="bg-primary text-white rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[85%]">
                  <p className="text-sm">{msg.content}</p>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-secondary flex items-center justify-center text-xs">
                  {msg.agentName?.charAt(0) || 'A'}
                </div>
                <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-2.5 max-w-[85%]">
                  {msg.agentName && (
                    <p className={`text-xs font-semibold mb-1 ${AGENT_COLORS[msg.agentRole!] || 'text-primary'}`}>
                      {msg.agentName}
                    </p>
                  )}
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                </div>
              </div>
            )}
          </div>
        ))}

        {isCommandLoading && (
          <div className="flex gap-2 fade-in">
            <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-secondary flex items-center justify-center">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            </div>
            <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-2.5">
              <p className="text-xs text-muted-foreground">Agents are working on your directive...</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a directive for your agents..."
            disabled={isCommandLoading}
            className="flex-1 px-4 py-2.5 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isCommandLoading}
            className="px-4 py-2.5 bg-primary hover:bg-accent text-white rounded-xl transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </aside>
  );
}

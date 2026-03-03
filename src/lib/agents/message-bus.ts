import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentRole, AgentMessage, MessageBusContext, MessagePriority } from '../types';
import { v4 as uuid } from 'uuid';

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_CHAIN_DEPTH = 3;

export class MessageBus {
  private context: MessageBusContext;
  private supabase: SupabaseClient;
  private visitedPairs: Set<string> = new Set();

  constructor(cycleId: string, companyId: string, supabase: SupabaseClient) {
    this.supabase = supabase;
    this.context = {
      cycleId,
      companyId,
      messageLog: [],
    };
  }

  async sendRequest(
    from: AgentRole,
    to: AgentRole,
    subject: string,
    body: string,
    priority: MessagePriority = 'normal'
  ): Promise<AgentMessage> {
    const pairKey = `${from}→${to}→${subject}`;
    const reversePairKey = `${to}→${from}→${subject}`;

    if (this.visitedPairs.has(reversePairKey)) {
      throw new Error(`Circular dependency detected: ${pairKey}`);
    }

    if (this.getChainDepth(subject) >= MAX_CHAIN_DEPTH) {
      throw new Error(`Max chain depth (${MAX_CHAIN_DEPTH}) exceeded for ${pairKey}`);
    }

    this.visitedPairs.add(pairKey);

    const message: AgentMessage = {
      id: uuid(),
      cycleId: this.context.cycleId,
      companyId: this.context.companyId,
      fromRole: from,
      toRole: to,
      type: 'request',
      priority,
      subject,
      body,
      correlationId: null,
      createdAt: new Date().toISOString(),
    };
    message.correlationId = message.id;

    this.context.messageLog.push(message);
    this.persistMessage(message);

    return message;
  }

  async sendResponse(
    correlationId: string,
    from: AgentRole,
    responseData: string,
    payload?: Record<string, unknown>
  ): Promise<AgentMessage> {
    const originalRequest = this.context.messageLog.find(
      (m) => m.id === correlationId || m.correlationId === correlationId
    );

    const message: AgentMessage = {
      id: uuid(),
      cycleId: this.context.cycleId,
      companyId: this.context.companyId,
      fromRole: from,
      toRole: originalRequest?.fromRole ?? null,
      type: 'response',
      priority: 'normal',
      subject: originalRequest?.subject ?? 'response',
      body: responseData,
      payload,
      correlationId,
      createdAt: new Date().toISOString(),
    };

    this.context.messageLog.push(message);
    this.persistMessage(message);

    return message;
  }

  async broadcast(from: AgentRole, subject: string, body: string): Promise<AgentMessage> {
    const message: AgentMessage = {
      id: uuid(),
      cycleId: this.context.cycleId,
      companyId: this.context.companyId,
      fromRole: from,
      toRole: null,
      type: 'broadcast',
      priority: 'normal',
      subject,
      body,
      correlationId: null,
      createdAt: new Date().toISOString(),
    };

    this.context.messageLog.push(message);
    this.persistMessage(message);

    return message;
  }

  async delegateTasks(
    from: AgentRole,
    delegations: { to: AgentRole; subject: string; body: string }[]
  ): Promise<AgentMessage[]> {
    const messages: AgentMessage[] = [];

    for (const d of delegations) {
      const message: AgentMessage = {
        id: uuid(),
        cycleId: this.context.cycleId,
        companyId: this.context.companyId,
        fromRole: from,
        toRole: d.to,
        type: 'delegation',
        priority: 'normal',
        subject: d.subject,
        body: d.body,
        correlationId: null,
        createdAt: new Date().toISOString(),
      };

      this.context.messageLog.push(message);
      this.persistMessage(message);
      messages.push(message);
    }

    return messages;
  }

  getMessagesForAgent(role: AgentRole): AgentMessage[] {
    return this.context.messageLog.filter(
      (m) => m.toRole === role || m.toRole === null || m.fromRole === role
    );
  }

  getPendingRequestsFor(role: AgentRole): AgentMessage[] {
    const requests = this.context.messageLog.filter(
      (m) => m.toRole === role && m.type === 'request'
    );

    return requests.filter((req) => {
      const hasResponse = this.context.messageLog.some(
        (m) => m.correlationId === req.correlationId && m.type === 'response'
      );
      return !hasResponse;
    });
  }

  getConversationThread(correlationId: string): AgentMessage[] {
    return this.context.messageLog
      .filter((m) => m.correlationId === correlationId || m.id === correlationId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  getAllMessages(): AgentMessage[] {
    return [...this.context.messageLog];
  }

  getCompanyId(): string {
    return this.context.companyId;
  }

  formatMessagesForAgent(role: AgentRole): string {
    const messages = this.getMessagesForAgent(role);
    if (messages.length === 0) return '';

    const lines: string[] = ['## Inter-Agent Messages'];

    for (const m of messages) {
      const direction = m.fromRole === role ? '→ Sent' : '← Received';
      const target = m.toRole ? m.toRole : 'all';
      lines.push(`- ${direction} [${m.type}] ${m.fromRole}→${target}: ${m.subject}`);
      lines.push(`  ${m.body.slice(0, 300)}`);
    }

    return lines.join('\n');
  }

  sweepExpiredRequests(): AgentMessage[] {
    const now = Date.now();
    const expired: AgentMessage[] = [];

    for (const msg of this.context.messageLog) {
      if (msg.type !== 'request') continue;

      const hasResponse = this.context.messageLog.some(
        (m) => m.correlationId === msg.correlationId && m.type === 'response'
      );
      if (hasResponse) continue;

      const age = now - new Date(msg.createdAt).getTime();
      if (age > REQUEST_TIMEOUT_MS) {
        const timeoutResponse: AgentMessage = {
          id: uuid(),
          cycleId: this.context.cycleId,
          companyId: this.context.companyId,
          fromRole: msg.toRole ?? msg.fromRole,
          toRole: msg.fromRole,
          type: 'response',
          priority: 'normal',
          subject: msg.subject,
          body: `[TIMEOUT] Request expired after ${REQUEST_TIMEOUT_MS / 1000}s. Agent was unable to respond in time.`,
          correlationId: msg.correlationId,
          createdAt: new Date().toISOString(),
        };

        this.context.messageLog.push(timeoutResponse);
        expired.push(msg);
      }
    }

    return expired;
  }

  private getChainDepth(subject: string): number {
    let depth = 0;
    for (const key of this.visitedPairs) {
      if (key.includes(subject)) depth++;
    }
    return depth;
  }

  private persistMessage(message: AgentMessage): void {
    this.supabase
      .from('agent_messages')
      .insert({
        id: message.id,
        cycle_id: message.cycleId,
        company_id: message.companyId,
        from_role: message.fromRole,
        to_role: message.toRole,
        type: message.type,
        priority: message.priority,
        subject: message.subject,
        body: message.body,
        payload: message.payload ?? null,
        correlation_id: message.correlationId,
      })
      .then(() => {});
  }
}

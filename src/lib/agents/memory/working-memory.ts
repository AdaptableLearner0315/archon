import type { AgentRole, WorkingMemoryEntry } from '../../types';

const MAX_ENTRIES = 100;

export class WorkingMemory {
  private store: Map<string, WorkingMemoryEntry> = new Map();
  readonly cycleId: string;

  constructor(cycleId: string) {
    this.cycleId = cycleId;
  }

  private makeKey(agentRole: AgentRole, key: string): string {
    return `${agentRole}:${key}`;
  }

  set(agentRole: AgentRole, key: string, value: unknown): void {
    const fullKey = this.makeKey(agentRole, key);
    const now = Date.now();

    // LRU eviction if at capacity
    if (this.store.size >= MAX_ENTRIES && !this.store.has(fullKey)) {
      let oldestKey: string | null = null;
      let oldestAccess = Infinity;
      for (const [k, entry] of this.store) {
        if (entry.lastAccessedAt < oldestAccess) {
          oldestAccess = entry.lastAccessedAt;
          oldestKey = k;
        }
      }
      if (oldestKey) this.store.delete(oldestKey);
    }

    this.store.set(fullKey, {
      key,
      agentRole,
      value,
      createdAt: this.store.get(fullKey)?.createdAt ?? now,
      lastAccessedAt: now,
    });
  }

  get(agentRole: AgentRole, key: string): unknown | undefined {
    const fullKey = this.makeKey(agentRole, key);
    const entry = this.store.get(fullKey);
    if (entry) {
      entry.lastAccessedAt = Date.now();
      return entry.value;
    }
    return undefined;
  }

  getAll(agentRole?: AgentRole): WorkingMemoryEntry[] {
    const entries = Array.from(this.store.values());
    if (agentRole) {
      return entries.filter((e) => e.agentRole === agentRole);
    }
    return entries;
  }

  has(agentRole: AgentRole, key: string): boolean {
    return this.store.has(this.makeKey(agentRole, key));
  }

  delete(agentRole: AgentRole, key: string): boolean {
    return this.store.delete(this.makeKey(agentRole, key));
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

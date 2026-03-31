// memory.ts — Multi-user memory system for businesslog agent

import type { MemoryEntry } from './types.js';

const MAX_ENTRIES_PER_USER = 1000;
const CONFIDENCE_DECAY_FACTOR = 0.95;

function generateId(): string {
  return `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class AgentMemory {
  private memories: Map<string, Map<string, MemoryEntry>> = new Map();

  private getUserMap(userId: string): Map<string, MemoryEntry> {
    if (!this.memories.has(userId)) {
      this.memories.set(userId, new Map());
    }
    return this.memories.get(userId)!;
  }

  store(
    userId: string,
    key: string,
    value: string,
    confidence: number = 0.8,
    source: string = 'explicit'
  ): MemoryEntry {
    const userMap = this.getUserMap(userId);
    const existing = userMap.get(key);
    const now = new Date();

    if (existing) {
      existing.value = value;
      existing.confidence = confidence;
      existing.source = source;
      existing.lastAccessed = now;
      return existing;
    }

    if (userMap.size >= MAX_ENTRIES_PER_USER) {
      this.evictLowest(userId);
    }

    const entry: MemoryEntry = {
      id: generateId(),
      userId,
      key,
      value,
      confidence,
      source,
      createdAt: now,
      lastAccessed: now,
    };
    userMap.set(key, entry);
    return entry;
  }

  retrieve(userId: string, key: string): MemoryEntry | undefined {
    const userMap = this.memories.get(userId);
    if (!userMap) return undefined;
    const entry = userMap.get(key);
    if (entry) {
      entry.lastAccessed = new Date();
    }
    return entry;
  }

  search(userId: string, query: string): MemoryEntry[] {
    const userMap = this.memories.get(userId);
    if (!userMap) return [];

    const lowerQuery = query.toLowerCase();
    const results: MemoryEntry[] = [];

    for (const entry of userMap.values()) {
      if (
        entry.key.toLowerCase().includes(lowerQuery) ||
        entry.value.toLowerCase().includes(lowerQuery)
      ) {
        entry.lastAccessed = new Date();
        results.push(entry);
      }
    }

    results.sort((a, b) => b.confidence - a.confidence);
    return results;
  }

  getAll(userId: string): MemoryEntry[] {
    const userMap = this.memories.get(userId);
    if (!userMap) return [];
    return Array.from(userMap.values());
  }

  prune(userId: string, maxAge: Date): number {
    const userMap = this.memories.get(userId);
    if (!userMap) return 0;

    let pruned = 0;
    const keysToRemove: string[] = [];

    for (const [key, entry] of userMap) {
      entry.confidence = entry.confidence * CONFIDENCE_DECAY_FACTOR;

      if (entry.createdAt < maxAge && entry.confidence < 0.3) {
        keysToRemove.push(key);
        pruned++;
      }
    }

    for (const key of keysToRemove) {
      userMap.delete(key);
    }

    return pruned;
  }

  shareMemory(fromUserId: string, toUserId: string, key: string): MemoryEntry | undefined {
    const entry = this.retrieve(fromUserId, key);
    if (!entry) return undefined;

    return this.store(toUserId, entry.key, entry.value, entry.confidence * 0.9, `shared:${fromUserId}`);
  }

  private evictLowest(userId: string): void {
    const userMap = this.memories.get(userId);
    if (!userMap || userMap.size === 0) return;

    let lowestKey: string | null = null;
    let lowestScore = Infinity;

    for (const [key, entry] of userMap) {
      const ageMs = Date.now() - entry.lastAccessed.getTime();
      const score = entry.confidence / (1 + ageMs / (1000 * 60 * 60 * 24));
      if (score < lowestScore) {
        lowestScore = score;
        lowestKey = key;
      }
    }

    if (lowestKey !== null) {
      userMap.delete(lowestKey);
    }
  }
}

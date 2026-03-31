import type { KnowledgeEntry } from './types.js';

export interface KnowledgeCreateInput {
  title: string;
  content: string;
  category: string;
  tags?: string[];
  createdBy: string;
}

export interface KnowledgeUpdateInput {
  title?: string;
  content?: string;
  category?: string;
  tags?: string[];
}

export interface SearchResult {
  entry: KnowledgeEntry;
  score: number;
}

export interface CategoryInfo {
  category: string;
  count: number;
}

let entryCounter = 0;

function generateId(): string {
  entryCounter += 1;
  return `kb_${Date.now()}_${entryCounter}`;
}

export interface KnowledgeStore {
  create(input: KnowledgeCreateInput): KnowledgeEntry;
  get(id: string): KnowledgeEntry | undefined;
  update(id: string, updates: KnowledgeUpdateInput): KnowledgeEntry | undefined;
  delete(id: string): boolean;
  search(query: string): SearchResult[];
  listByCategory(category: string): KnowledgeEntry[];
}

export class InMemoryKnowledgeStore implements KnowledgeStore {
  private entries = new Map<string, KnowledgeEntry>();

  create(input: KnowledgeCreateInput): KnowledgeEntry {
    const now = new Date();
    const entry: KnowledgeEntry = {
      id: generateId(),
      title: input.title,
      content: input.content,
      category: input.category,
      tags: input.tags ?? [],
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
      accessCount: 0,
    };
    this.entries.set(entry.id, entry);
    return entry;
  }

  get(id: string): KnowledgeEntry | undefined {
    return this.entries.get(id);
  }

  update(id: string, updates: KnowledgeUpdateInput): KnowledgeEntry | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;

    const updated: KnowledgeEntry = {
      ...entry,
      ...updates,
      updatedAt: new Date(),
    };
    this.entries.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.entries.delete(id);
  }

  search(query: string): SearchResult[] {
    const q = query.toLowerCase();
    const results: SearchResult[] = [];

    for (const entry of this.entries.values()) {
      let score = 0;
      const titleLower = entry.title.toLowerCase();
      const contentLower = entry.content.toLowerCase();

      // Title match gets highest weight
      if (titleLower.includes(q)) score += 10;
      // Content match
      if (contentLower.includes(q)) score += 5;
      // Tag match
      for (const tag of entry.tags) {
        if (tag.toLowerCase().includes(q)) score += 7;
      }
      // Word-level partial matching in title
      const words = q.split(/\s+/);
      for (const word of words) {
        if (titleLower.includes(word)) score += 2;
        if (contentLower.includes(word)) score += 1;
      }

      if (score > 0) {
        results.push({ entry, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results;
  }

  listByCategory(category: string): KnowledgeEntry[] {
    return [...this.entries.values()].filter(e => e.category === category);
  }

  incrementAccess(id: string): void {
    const entry = this.entries.get(id);
    if (entry) {
      entry.accessCount += 1;
      this.entries.set(id, entry);
    }
  }

  listCategories(): CategoryInfo[] {
    const counts: Record<string, number> = {};
    for (const entry of this.entries.values()) {
      counts[entry.category] = (counts[entry.category] ?? 0) + 1;
    }
    return Object.entries(counts).map(([category, count]) => ({ category, count }));
  }
}

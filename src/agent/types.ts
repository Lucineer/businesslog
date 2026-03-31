// types.ts — Businesslog agent core type definitions

export type AgentMode = 'public' | 'private' | 'maintenance' | 'a2a';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
  userId: string;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
}

export interface MemoryEntry {
  id: string;
  userId: string;
  key: string;
  value: string;
  confidence: number;
  source: string;
  createdAt: Date;
  lastAccessed: Date;
}

export interface TeamContext {
  teamName: string;
  members: string[];
  activeProjects: string[];
  recentTopics: string[];
}

export interface LLMConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface StreamChunk {
  delta: string;
  done: boolean;
  conversationId: string;
}

// index.ts — Agent module exports and factory

import type { AgentMode, ChatMessage, LLMConfig, TeamContext } from './types.js';
import { AgentMemory } from './memory.js';
import { AgentRouter } from './router.js';
import { OpenAICompatibleProvider, MockProvider } from './llm.js';
import type { LLMProvider } from './llm.js';
import { buildSystemPrompt, buildTeamContext, buildConversationContext, buildMemoryContext, estimateTokens, DEFAULT_SOUL_TEMPLATE } from './context.js';

export type { AgentMode, MessageRole, ChatMessage, Conversation, MemoryEntry, TeamContext, LLMConfig, StreamChunk } from './types.js';
export type { LLMProvider } from './llm.js';
export type { Intent, RouterContext, RouteResult } from './router.js';
export { AgentMemory } from './memory.js';
export { AgentRouter } from './router.js';
export { OpenAICompatibleProvider, MockProvider } from './llm.js';
export {
  buildSystemPrompt,
  buildTeamContext,
  buildConversationContext,
  buildMemoryContext,
  estimateTokens,
  DEFAULT_SOUL_TEMPLATE,
} from './context.js';

export interface AgentConfig {
  mode: AgentMode;
  team: TeamContext;
  llm: LLMConfig;
  soulOverride?: string;
}

export interface Agent {
  memory: AgentMemory;
  router: AgentRouter;
  provider: LLMProvider;
  chat(userId: string, message: string, history?: ChatMessage[]): Promise<string>;
  chatStream(userId: string, message: string, history?: ChatMessage[]): AsyncGenerator<import('./types.js').StreamChunk>;
}

export function createAgent(config: AgentConfig): Agent {
  const memory = new AgentMemory();
  const provider = new OpenAICompatibleProvider(config.llm);
  const router = new AgentRouter({
    llm: provider,
    memory,
    teamContext: config.team,
    mode: config.mode,
    soulOverride: config.soulOverride,
  });

  return {
    memory,
    router,
    provider,

    async chat(userId: string, message: string, history: ChatMessage[] = []): Promise<string> {
      const userMessage: ChatMessage = {
        id: `msg_${Date.now().toString(36)}`,
        role: 'user',
        content: message,
        timestamp: new Date(),
        userId,
      };
      const messages = [...history, userMessage];
      const result = await router.route(userId, messages, false);

      const responseText = result.response as string;
      const intent = result.intent;

      memory.store(userId, `last_intent`, intent, 0.6, 'inferred');
      if (responseText.length > 0) {
        memory.store(
          userId,
          `last_response_${Date.now().toString(36)}`,
          responseText.slice(0, 500),
          0.5,
          'conversation'
        );
      }

      return responseText;
    },

    async *chatStream(
      userId: string,
      message: string,
      history: ChatMessage[] = []
    ): AsyncGenerator<import('./types.js').StreamChunk> {
      const userMessage: ChatMessage = {
        id: `msg_${Date.now().toString(36)}`,
        role: 'user',
        content: message,
        timestamp: new Date(),
        userId,
      };
      const messages = [...history, userMessage];
      const result = await router.route(userId, messages, true);

      const stream = result.response as AsyncGenerator<import('./types.js').StreamChunk>;
      let fullResponse = '';

      for await (const chunk of stream) {
        fullResponse += chunk.delta;
        yield chunk;
      }

      memory.store(userId, `last_intent`, result.intent, 0.6, 'inferred');
      if (fullResponse.length > 0) {
        memory.store(
          userId,
          `last_response_${Date.now().toString(36)}`,
          fullResponse.slice(0, 500),
          0.5,
          'conversation'
        );
      }
    },
  };
}

export function createMockAgent(config: {
  mode?: AgentMode;
  team?: TeamContext;
  responses?: string[];
}): Agent {
  const mode = config.mode ?? 'private';
  const team = config.team ?? {
    teamName: 'Test Team',
    members: ['alice'],
    activeProjects: ['test-project'],
    recentTopics: ['testing'],
  };

  const memory = new AgentMemory();
  const provider = new MockProvider(config.responses);
  const router = new AgentRouter({
    llm: provider,
    memory,
    teamContext: team,
    mode,
  });

  return {
    memory,
    router,
    provider,

    async chat(userId: string, message: string, history: ChatMessage[] = []): Promise<string> {
      const userMessage: ChatMessage = {
        id: `msg_${Date.now().toString(36)}`,
        role: 'user',
        content: message,
        timestamp: new Date(),
        userId,
      };
      const messages = [...history, userMessage];
      const result = await router.route(userId, messages, false);
      return result.response as string;
    },

    async *chatStream(
      userId: string,
      message: string,
      history: ChatMessage[] = []
    ): AsyncGenerator<import('./types.js').StreamChunk> {
      const userMessage: ChatMessage = {
        id: `msg_${Date.now().toString(36)}`,
        role: 'user',
        content: message,
        timestamp: new Date(),
        userId,
      };
      const messages = [...history, userMessage];
      const result = await router.route(userId, messages, true);
      const stream = result.response as AsyncGenerator<import('./types.js').StreamChunk>;
      for await (const chunk of stream) {
        yield chunk;
      }
    },
  };
}

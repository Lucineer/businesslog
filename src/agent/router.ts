// router.ts — Agent message router with intent detection

import type { AgentMode, ChatMessage, LLMConfig, MemoryEntry, TeamContext } from './types.js';
import type { LLMProvider } from './llm.js';
import type { AgentMemory } from './memory.js';
import {
  buildSystemPrompt,
  buildTeamContext,
  buildConversationContext,
  buildMemoryContext,
} from './context.js';

export type Intent = 'question' | 'task' | 'report' | 'chat' | 'search';

export interface RouterContext {
  mode: AgentMode;
  team: TeamContext;
  userId: string;
  conversationId: string;
}

export interface RouteResult {
  intent: Intent;
  response: string | AsyncGenerator<import('./types.js').StreamChunk>;
  enrichedContext: string;
}

export class AgentRouter {
  private llm: LLMProvider;
  private memory: AgentMemory;
  private teamContext: TeamContext;
  private mode: AgentMode;
  private soulOverride?: string;

  constructor(deps: {
    llm: LLMProvider;
    memory: AgentMemory;
    teamContext: TeamContext;
    mode: AgentMode;
    soulOverride?: string;
  }) {
    this.llm = deps.llm;
    this.memory = deps.memory;
    this.teamContext = deps.teamContext;
    this.mode = deps.mode;
    this.soulOverride = deps.soulOverride;
  }

  detectIntent(message: string): Intent {
    const lower = message.toLowerCase().trim();

    const searchPatterns = [
      /^(find|search|look up|where is|locate|show me all)/i,
      /^(what do we know about|what have we|any info on)/i,
    ];
    for (const pattern of searchPatterns) {
      if (pattern.test(lower)) return 'search';
    }

    const reportPatterns = [
      /^(summarize|report|status|update|dashboard|overview)/i,
      /^(what'?s the status|give me a report|how are we)/i,
      /^(weekly|monthly|daily|quarterly)/i,
    ];
    for (const pattern of reportPatterns) {
      if (pattern.test(lower)) return 'report';
    }

    const taskPatterns = [
      /^(create|add|remove|update|delete|schedule|assign|set up|configure)/i,
      /^(please |can you )?(make|build|write|draft|send|move|change)/i,
    ];
    for (const pattern of taskPatterns) {
      if (pattern.test(lower)) return 'task';
    }

    const questionPatterns = [
      /^(what|why|how|when|where|who|which|can|does|is|are|will|should)/i,
      /^(explain|tell me about|describe|clarify)/i,
      /\?/,
    ];
    for (const pattern of questionPatterns) {
      if (pattern.test(lower)) return 'question';
    }

    return 'chat';
  }

  buildEnrichedContext(userId: string, intent: Intent, messages: ChatMessage[]): string {
    const parts: string[] = [];

    const systemPrompt = buildSystemPrompt({
      teamName: this.teamContext.teamName,
      soulOverride: this.soulOverride,
    });
    parts.push(systemPrompt);

    const teamCtx = buildTeamContext(
      this.teamContext.members,
      this.teamContext.activeProjects,
      this.teamContext.recentTopics
    );
    if (teamCtx) {
      parts.push(`\n${teamCtx}`);
    }

    const allMemories = this.memory.getAll(userId);
    let relevantMemories: MemoryEntry[];

    if (intent === 'search') {
      const lastUserMsg = messages.filter((m) => m.role === 'user').pop();
      relevantMemories = lastUserMsg
        ? this.memory.search(userId, lastUserMsg.content)
        : allMemories;
    } else if (intent === 'report') {
      relevantMemories = allMemories.filter(
        (m) =>
          m.key.includes('project') ||
          m.key.includes('status') ||
          m.key.includes('metric') ||
          m.key.includes('deadline')
      );
    } else {
      relevantMemories = allMemories.slice(0, 20);
    }

    const memoryCtx = buildMemoryContext(relevantMemories);
    if (memoryCtx) {
      parts.push(`\n${memoryCtx}`);
    }

    const convCtx = buildConversationContext(messages);
    if (convCtx) {
      parts.push(`\nRecent conversation:\n${convCtx}`);
    }

    return parts.join('\n');
  }

  async route(
    userId: string,
    messages: ChatMessage[],
    stream: boolean = false
  ): Promise<RouteResult> {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      throw new Error('Last message must be from the user');
    }

    const intent = this.detectIntent(lastMessage.content);
    const enrichedContext = this.buildEnrichedContext(userId, intent, messages);

    const fullMessages: ChatMessage[] = [
      {
        id: 'system',
        role: 'system',
        content: enrichedContext,
        timestamp: new Date(),
        userId,
      },
      ...messages,
    ];

    if (stream) {
      const responseGen = this.llm.chatStream(fullMessages, {
        conversationId: messages[0]?.id ?? 'default',
      });
      return { intent, response: responseGen, enrichedContext };
    }

    const response = await this.llm.chat(fullMessages, {
      conversationId: messages[0]?.id ?? 'default',
    });
    return { intent, response, enrichedContext };
  }

  updateTeamContext(team: Partial<TeamContext>): void {
    this.teamContext = { ...this.teamContext, ...team };
  }

  setMode(mode: AgentMode): void {
    this.mode = mode;
  }

  getMode(): AgentMode {
    return this.mode;
  }
}

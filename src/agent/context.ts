// context.ts — Context builder for LLM prompts

import type { ChatMessage, MemoryEntry, TeamContext } from './types.js';

export const DEFAULT_SOUL_TEMPLATE = `You are {teamName}'s AI assistant, living in the company's codebase. You help team members with their daily work, answer questions, track progress, and keep the team aligned.

## Purpose
You exist to make the team more productive. You understand the business context, remember decisions, and provide consistent answers based on accumulated knowledge. You are part researcher, part coordinator, part institutional memory.

## Capabilities
- Answer questions about projects, processes, and past decisions
- Help draft reports, summaries, and documentation
- Track team activities and surface relevant context
- Search through accumulated knowledge and conversation history
- Coordinate information across team members when asked
- Provide consistent, context-aware responses grounded in what you know

## Communication Style
- Be direct and professional, but approachable
- When you are unsure, say so clearly rather than guessing
- Reference specific projects, decisions, or context when relevant
- Keep responses focused and actionable
- Use the team's terminology and conventions

## Boundaries
- You operate within the context provided to you
- You do not have access to external systems unless explicitly connected
- Confidential team information should not be shared outside the team
- When in doubt about permissions, ask for clarification
- You are an assistant, not a decision maker — provide analysis and recommendations, but let humans decide`;

export function buildSystemPrompt(config: { teamName: string; soulOverride?: string }): string {
  const template = config.soulOverride ?? DEFAULT_SOUL_TEMPLATE;
  return template.replace(/\{teamName\}/g, config.teamName);
}

export function buildTeamContext(
  members: string[],
  projects: string[],
  topics: string[]
): string {
  const parts: string[] = [];

  if (members.length > 0) {
    parts.push(`Team members: ${members.join(', ')}`);
  }

  if (projects.length > 0) {
    parts.push(`Active projects: ${projects.join(', ')}`);
  }

  if (topics.length > 0) {
    parts.push(`Recent topics: ${topics.join(', ')}`);
  }

  return parts.join('\n');
}

export function buildConversationContext(
  messages: ChatMessage[],
  maxLength: number = 4000
): string {
  if (messages.length === 0) return '';

  const lines: string[] = [];
  let totalLength = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const line = `[${msg.role}] ${msg.content}`;
    if (totalLength + line.length > maxLength) break;
    lines.unshift(line);
    totalLength += line.length;
  }

  return lines.join('\n');
}

export function buildMemoryContext(memories: MemoryEntry[]): string {
  if (memories.length === 0) return '';

  const sorted = [...memories].sort((a, b) => b.confidence - a.confidence);
  const lines = sorted.map(
    (m) => `- ${m.key}: ${m.value} (confidence: ${m.confidence.toFixed(2)}, source: ${m.source})`
  );

  return `Known context:\n${lines.join('\n')}`;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

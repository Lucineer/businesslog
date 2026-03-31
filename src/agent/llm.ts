// llm.ts — LLM provider abstraction

import type { ChatMessage, LLMConfig, StreamChunk } from './types.js';

export interface LLMProvider {
  chat(messages: ChatMessage[], options?: { conversationId?: string }): Promise<string>;
  chatStream(
    messages: ChatMessage[],
    options?: { conversationId?: string }
  ): AsyncGenerator<StreamChunk>;
}

export class OpenAICompatibleProvider implements LLMProvider {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  async chat(
    messages: ChatMessage[],
    options?: { conversationId?: string }
  ): Promise<string> {
    const url = this.buildUrl();
    const body = {
      model: this.config.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: this.config.temperature ?? 0.7,
      max_tokens: this.config.maxTokens ?? 2048,
      stream: false,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `LLM API error (${response.status}): ${errorText}`
      );
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0]?.message?.content ?? '';
  }

  async *chatStream(
    messages: ChatMessage[],
    options?: { conversationId?: string }
  ): AsyncGenerator<StreamChunk> {
    const url = this.buildUrl();
    const conversationId = options?.conversationId ?? 'default';
    const body = {
      model: this.config.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: this.config.temperature ?? 0.7,
      max_tokens: this.config.maxTokens ?? 2048,
      stream: true,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `LLM API error (${response.status}): ${errorText}`
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          yield { delta: '', done: true, conversationId };
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const dataStr = trimmed.slice(6);
          if (dataStr === '[DONE]') {
            yield { delta: '', done: true, conversationId };
            return;
          }

          try {
            const parsed = JSON.parse(dataStr) as {
              choices: Array<{ delta: { content?: string } }>;
            };
            const delta = parsed.choices[0]?.delta?.content ?? '';
            if (delta) {
              yield { delta, done: false, conversationId };
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private buildUrl(): string {
    const base = this.config.baseUrl ?? 'https://api.openai.com/v1';
    return `${base.replace(/\/$/, '')}/chat/completions`;
  }
}

export class MockProvider implements LLMProvider {
  private cannedResponses: string[];
  private callIndex: number = 0;

  constructor(responses: string[] = ['This is a mock response.']) {
    this.cannedResponses = responses;
  }

  async chat(
    _messages: ChatMessage[],
    options?: { conversationId?: string }
  ): Promise<string> {
    const response = this.cannedResponses[this.callIndex % this.cannedResponses.length];
    this.callIndex++;
    return response;
  }

  async *chatStream(
    _messages: ChatMessage[],
    options?: { conversationId?: string }
  ): AsyncGenerator<StreamChunk> {
    const response = this.cannedResponses[this.callIndex % this.cannedResponses.length];
    this.callIndex++;
    const conversationId = options?.conversationId ?? 'default';

    const words = response.split(' ');
    for (let i = 0; i < words.length; i++) {
      const delta = i === 0 ? words[i] : ` ${words[i]}`;
      yield { delta, done: false, conversationId };
    }
    yield { delta: '', done: true, conversationId };
  }
}

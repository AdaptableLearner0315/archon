import Anthropic from '@anthropic-ai/sdk';
import type { AgentRole } from '../types';

// --- Model routing ---
type UseCase = 'command_center' | 'ceo_planning' | 'agent_task' | 'inter_agent' | 'retrospective' | 'memory_condensation' | 'memory_extraction' | 'memory_consolidation' | 'reflection';

interface ModelConfig {
  model: string;
  maxTokens: number;
  extendedThinking: boolean;
  thinkingBudget: number;
}

const MODEL_ROUTING: Record<UseCase, ModelConfig> = {
  command_center: { model: 'claude-sonnet-4-20250514', maxTokens: 4096, extendedThinking: false, thinkingBudget: 0 },
  ceo_planning: { model: 'claude-opus-4-6-20250616', maxTokens: 8192, extendedThinking: true, thinkingBudget: 4096 },
  agent_task: { model: 'claude-sonnet-4-20250514', maxTokens: 4096, extendedThinking: false, thinkingBudget: 0 },
  inter_agent: { model: 'claude-sonnet-4-20250514', maxTokens: 2048, extendedThinking: false, thinkingBudget: 0 },
  retrospective: { model: 'claude-opus-4-6-20250616', maxTokens: 4096, extendedThinking: true, thinkingBudget: 2048 },
  memory_condensation: { model: 'claude-sonnet-4-20250514', maxTokens: 1024, extendedThinking: false, thinkingBudget: 0 },
  memory_extraction: { model: 'claude-sonnet-4-20250514', maxTokens: 2048, extendedThinking: false, thinkingBudget: 0 },
  memory_consolidation: { model: 'claude-sonnet-4-20250514', maxTokens: 1024, extendedThinking: false, thinkingBudget: 0 },
  reflection: { model: 'claude-opus-4-6-20250616', maxTokens: 4096, extendedThinking: true, thinkingBudget: 2048 },
};

// Cost per million tokens (approximate)
const COST_TABLE: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-opus-4-6-20250616': { input: 15, output: 75 },
};

export interface ClaudeCallConfig {
  useCase: UseCase;
  system: string;
  messages: Anthropic.MessageParam[];
  maxTokensOverride?: number;
  enableThinkingOverride?: boolean;
  thinkingBudgetOverride?: number;
}

export interface ClaudeCallResult {
  text: string;
  thinkingText: string;
  usage: { inputTokens: number; outputTokens: number };
  costUsd: number;
}

export interface ClaudeStreamChunk {
  type: 'thinking' | 'text' | 'done';
  content: string;
  usage?: { inputTokens: number; outputTokens: number };
  costUsd?: number;
}

class ClaudeClientSingleton {
  private client: Anthropic;
  private static instance: ClaudeClientSingleton;

  private constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }

  static getInstance(): ClaudeClientSingleton {
    if (!ClaudeClientSingleton.instance) {
      ClaudeClientSingleton.instance = new ClaudeClientSingleton();
    }
    return ClaudeClientSingleton.instance;
  }

  private getConfig(config: ClaudeCallConfig): ModelConfig {
    const base = MODEL_ROUTING[config.useCase];
    return {
      model: base.model,
      maxTokens: config.maxTokensOverride ?? base.maxTokens,
      extendedThinking: config.enableThinkingOverride ?? base.extendedThinking,
      thinkingBudget: config.thinkingBudgetOverride ?? base.thinkingBudget,
    };
  }

  private calculateCost(model: string, usage: { inputTokens: number; outputTokens: number }): number {
    const rates = COST_TABLE[model] ?? { input: 3, output: 15 };
    return (usage.inputTokens * rates.input + usage.outputTokens * rates.output) / 1_000_000;
  }

  async call(config: ClaudeCallConfig): Promise<ClaudeCallResult> {
    const mc = this.getConfig(config);

    const params: Record<string, unknown> = {
      model: mc.model,
      max_tokens: mc.maxTokens,
      system: config.system,
      messages: config.messages,
    };

    if (mc.extendedThinking) {
      params.thinking = { type: 'enabled', budget_tokens: mc.thinkingBudget };
      // When thinking is enabled, max_tokens must account for thinking budget
      params.max_tokens = mc.maxTokens + mc.thinkingBudget;
    }

    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create(params as unknown as Anthropic.MessageCreateParamsNonStreaming);
    } catch (err: unknown) {
      const error = err as { status?: number; message?: string };
      // Retry once on 5xx
      if (error.status && error.status >= 500) {
        await new Promise((r) => setTimeout(r, 2000));
        response = await this.client.messages.create(params as unknown as Anthropic.MessageCreateParamsNonStreaming);
      } else if (error.status === 429) {
        throw new Error('Rate limited by Claude API. Please try again in a moment.');
      } else {
        throw err;
      }
    }

    let text = '';
    let thinkingText = '';

    for (const block of response.content) {
      if (block.type === 'text') {
        text += block.text;
      } else if (block.type === 'thinking') {
        thinkingText += block.thinking;
      }
    }

    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };

    return {
      text,
      thinkingText,
      usage,
      costUsd: this.calculateCost(mc.model, usage),
    };
  }

  async *stream(config: ClaudeCallConfig): AsyncGenerator<ClaudeStreamChunk> {
    const mc = this.getConfig(config);

    const params: Record<string, unknown> = {
      model: mc.model,
      max_tokens: mc.maxTokens,
      system: config.system,
      messages: config.messages,
    };

    if (mc.extendedThinking) {
      params.thinking = { type: 'enabled', budget_tokens: mc.thinkingBudget };
      params.max_tokens = mc.maxTokens + mc.thinkingBudget;
    }

    const stream = this.client.messages.stream(params as unknown as Anthropic.MessageCreateParamsStreaming);

    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'thinking_delta') {
          yield { type: 'thinking', content: event.delta.thinking };
        } else if (event.delta.type === 'text_delta') {
          yield { type: 'text', content: event.delta.text };
        }
      } else if (event.type === 'message_delta') {
        totalOutputTokens = event.usage?.output_tokens ?? totalOutputTokens;
      } else if (event.type === 'message_start') {
        totalInputTokens = event.message?.usage?.input_tokens ?? 0;
      }
    }

    yield {
      type: 'done',
      content: '',
      usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      costUsd: this.calculateCost(mc.model, { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }),
    };
  }
}

export const ClaudeClient = ClaudeClientSingleton.getInstance();

export { MODEL_ROUTING, COST_TABLE };
export type { UseCase, ModelConfig };

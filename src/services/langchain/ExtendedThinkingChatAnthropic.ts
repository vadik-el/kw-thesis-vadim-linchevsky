import Anthropic from '@anthropic-ai/sdk';
import { ChatAnthropic } from "@langchain/anthropic";
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { ChatResult, ChatGeneration } from "@langchain/core/outputs";
import { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import { logger } from '../../utils/logger';
import { ExtendedThinkingService } from '../extendedThinkingService';

/**
 * Custom ChatAnthropic that supports Extended Thinking
 * This wrapper combines LangChain's ChatAnthropic with direct Anthropic SDK
 * to enable Claude's native Extended Thinking feature
 */
export class ExtendedThinkingChatAnthropic extends ChatAnthropic {
  private anthropicClient: Anthropic;
  private extendedThinkingService: ExtendedThinkingService;
  private extendedThinkingConfig?: {
    enabled: boolean;
    budgetTokens?: number;
    includeInResponse?: boolean;
  };

  constructor(fields: any & { 
    extendedThinking?: {
      enabled: boolean;
      budgetTokens?: number;
      includeInResponse?: boolean;
    }
  }) {
    super(fields);
    
    // Initialize direct Anthropic client for Extended Thinking
    this.anthropicClient = new Anthropic({
      apiKey: fields.anthropicApiKey || process.env.ANTHROPIC_API_KEY,
    });
    
    this.extendedThinkingService = new ExtendedThinkingService();
    this.extendedThinkingConfig = fields.extendedThinking;
  }

  async _generate(
    messages: BaseMessage[],
    options: any,
    runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    // If Extended Thinking is not enabled, use parent implementation
    if (!this.extendedThinkingConfig?.enabled) {
      // Apply trimming fix from TrimmingChatAnthropic
      const trimmedMessages = this.trimMessages(messages);
      return super._generate(trimmedMessages, options, runManager);
    }

    try {
      // Convert LangChain messages to Anthropic format
      const anthropicMessages = this.convertToAnthropicFormat(messages);
      
      // Prepare Extended Thinking configuration
      const thinkingResult = this.extendedThinkingService.shouldEnableExtendedThinking({
        model: this.modelName as any,
        complexity: 0.8, // High complexity for agent operations
        personaId: 'admin',
        userPreference: this.extendedThinkingConfig,
      });

      // Create request with Extended Thinking
      const requestOptions: any = {
        model: this.modelName,
        max_tokens: this.maxTokens,
        temperature: 1, // Extended Thinking requires temperature 1
        messages: anthropicMessages,
        stream: false,
      };

      // Add thinking parameter if enabled
      const thinkingParam = this.extendedThinkingService.formatThinkingParameter(thinkingResult);
      if (thinkingParam) {
        requestOptions.thinking = thinkingParam;
        // Ensure max_tokens is sufficient
        const budgetTokens = thinkingResult.budgetTokens || 10000;
        requestOptions.max_tokens = Math.max(requestOptions.max_tokens, budgetTokens + 4096);
        
        logger.info(`Extended Thinking enabled for ReAct agent: ${JSON.stringify(thinkingParam)}`);
      }

      // Make direct API call
      const response = await this.anthropicClient.messages.create(requestOptions);
      
      // Log thinking output if available
      if (response.thinking) {
        const thinkingOutput = this.extendedThinkingService.processThinkingOutput(
          response.thinking,
          thinkingResult.thinkingType
        );
        logger.info(`Extended Thinking completed: ${thinkingOutput.summary}`);
        logger.debug(`Thinking tokens used: ${thinkingOutput.tokenCount}`);
      }

      // Convert response back to LangChain format
      const text = response.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('\n');

      const generation: ChatGeneration = {
        text,
        message: new AIMessage(text),
      };

      return {
        generations: [generation],
      };
    } catch (error) {
      logger.error('Extended Thinking execution failed:', error);
      // Fallback to regular generation
      const trimmedMessages = this.trimMessages(messages);
      return super._generate(trimmedMessages, options, runManager);
    }
  }

  private trimMessages(messages: BaseMessage[]): BaseMessage[] {
    return messages.map(msg => {
      if (msg instanceof AIMessage) {
        return new AIMessage(msg.content.toString().trimEnd());
      } else if (msg instanceof HumanMessage) {
        return new HumanMessage(msg.content.toString().trimEnd());
      } else if (msg instanceof SystemMessage) {
        return new SystemMessage(msg.content.toString().trimEnd());
      }
      return msg;
    });
  }

  private convertToAnthropicFormat(messages: BaseMessage[]): any[] {
    const anthropicMessages: any[] = [];
    
    for (const msg of messages) {
      if (msg instanceof SystemMessage) {
        // System messages should be handled separately in Anthropic API
        continue;
      }
      
      const role = msg instanceof HumanMessage ? 'user' : 'assistant';
      anthropicMessages.push({
        role,
        content: msg.content.toString(),
      });
    }

    return anthropicMessages;
  }

  // For streaming support with Extended Thinking
  async *_streamResponseChunks(
    messages: BaseMessage[],
    options: any,
    runManager?: CallbackManagerForLLMRun
  ): AsyncGenerator<any> {
    // Extended Thinking doesn't support streaming in the same way
    // Fall back to non-streaming for now
    const result = await this._generate(messages, options, runManager);
    
    // Yield the full result as a single chunk
    yield {
      text: result.generations[0].text,
      message: result.generations[0].message,
    };
  }

  setExtendedThinking(config: {
    enabled: boolean;
    budgetTokens?: number;
    includeInResponse?: boolean;
  }) {
    this.extendedThinkingConfig = config;
  }
}
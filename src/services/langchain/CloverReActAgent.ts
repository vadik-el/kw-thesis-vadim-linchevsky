import { ChatAnthropic } from "@langchain/anthropic";
import { AgentExecutor, createReactAgent } from "langchain/agents";
import { DynamicTool } from "@langchain/core/tools";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { pull } from "langchain/hub";
import { Readable } from 'stream';
import { RunnableLambda } from "@langchain/core/runnables";
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGenerationChunk, ChatResult } from "@langchain/core/outputs";
import { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import { logger } from '../../utils/logger';
import { DocumentSearchTool } from './tools/DocumentSearchTool';
import { QueryTradesTool } from './tools/QueryTradesTool';
import { TrackVesselTool } from './tools/TrackVesselTool';
import { GetDashboardTool } from './tools/GetDashboardTool';
import { AnalyzeRiskTool } from './tools/AnalyzeRiskTool';
import { GetFinancialSummaryTool } from './tools/GetFinancialSummaryTool';
import { AgentResponseProcessor } from './AgentResponseProcessor';
import { ExtendedThinkingService } from '../extendedThinkingService';
import { ExtendedThinkingChatAnthropic } from './ExtendedThinkingChatAnthropic';

/**
 * Custom ChatAnthropic wrapper that implements the industry-standard fix
 * for Anthropic API trailing whitespace constraint.
 * This is the same solution used by AutoGen, SillyTavern, and other projects.
 */
class TrimmingChatAnthropic extends ChatAnthropic {
  async _generate(
    messages: BaseMessage[],
    options: any,
    runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    // Apply the industry-standard fix: trim trailing whitespace from all messages
    const trimmedMessages = messages.map(msg => {
      if (msg instanceof AIMessage) {
        return new AIMessage(msg.content.toString().trimEnd());
      } else if (msg instanceof HumanMessage) {
        return new HumanMessage(msg.content.toString().trimEnd());
      } else if (msg instanceof SystemMessage) {
        return new SystemMessage(msg.content.toString().trimEnd());
      }
      return msg;
    });

    return super._generate(trimmedMessages, options, runManager);
  }

  async *_streamResponseChunks(
    messages: BaseMessage[],
    options: any,
    runManager?: CallbackManagerForLLMRun
  ): AsyncGenerator<ChatGenerationChunk> {
    // Apply the same trimming fix for streaming
    const trimmedMessages = messages.map(msg => {
      if (msg instanceof AIMessage) {
        return new AIMessage(msg.content.toString().trimEnd());
      } else if (msg instanceof HumanMessage) {
        return new HumanMessage(msg.content.toString().trimEnd());
      } else if (msg instanceof SystemMessage) {
        return new SystemMessage(msg.content.toString().trimEnd());
      }
      return msg;
    });

    yield* super._streamResponseChunks(trimmedMessages, options, runManager);
  }
}

export interface CloverAgentConfig {
  persona: 'admin' | 'management' | 'finance' | 'operations' | 'risk';
  temperature?: number;
  maxTokens?: number;
  extendedThinking?: {
    enabled: boolean;
    budgetTokens?: number;
  };
}

export interface CloverAgentResult {
  output: string;
  intermediateSteps: any[];
  toolsUsed: string[];
  thinkingContent?: string;
}

export class CloverReActAgent {
  private model: ChatAnthropic | ExtendedThinkingChatAnthropic;
  private tools: DynamicTool[];
  private agent: any;
  private agentExecutor: AgentExecutor | null = null;
  private config: CloverAgentConfig;
  private initialized: boolean = false;
  private extendedThinkingService: ExtendedThinkingService;

  constructor(config: CloverAgentConfig) {
    this.config = config;
    this.extendedThinkingService = new ExtendedThinkingService();

    // Use Extended Thinking wrapper if enabled
    if (config.extendedThinking?.enabled) {
      logger.info('🧠 Initializing ReAct agent with Extended Thinking support');
      this.model = new ExtendedThinkingChatAnthropic({
        modelName: "claude-3-5-sonnet-20241022",
        temperature: 1, // Extended Thinking requires temperature 1
        maxTokens: config.maxTokens || 4096,
        anthropicApiKey: process.env.ANTHROPIC_API_KEY,
        extendedThinking: config.extendedThinking
      });
    } else {
      // Use standard trimming wrapper without Extended Thinking
      this.model = new TrimmingChatAnthropic({
        modelName: "claude-3-5-sonnet-20241022",
        temperature: config.temperature || 0.7,
        maxTokens: config.maxTokens || 4096,
        anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      });
    }

    // Initialize tools with real implementations
    this.tools = [
      new DocumentSearchTool(),
      new QueryTradesTool(),
      new TrackVesselTool(),
      new GetDashboardTool(),
      new AnalyzeRiskTool(),
      new GetFinancialSummaryTool(),
    ];
  }

  private async initializeAgent(config: CloverAgentConfig) {
    try {
      // Create a custom ReAct prompt that works with LangChain
      const systemPrompt = this.getPersonaPrompt(config.persona);
      
      const prompt = ChatPromptTemplate.fromMessages([
        ["system", `${systemPrompt}

You have access to the following tools:

{tools}

IMPORTANT: Follow this format EXACTLY:

For queries that REQUIRE tools (data lookups, searches, calculations):
Question: the input question you must answer
Thought: you should always think about what to do
Action: the action to take, should be one of [{tool_names}]
Action Input: the input to the action
Observation: the result of the action
... (this Thought/Action/Action Input/Observation can repeat N times)
Thought: I now know the final answer
Final Answer: the final answer to the original input question

For greetings, general questions, or queries that DON'T require tools:
Question: the input question you must answer
Thought: This is a greeting/general query that doesn't require tool usage
Final Answer: [Your helpful response]

Remember: ALWAYS start with "Question:" and end with "Final Answer:"`.trim()],
        ["human", "{input}"],
        ["assistant", "{agent_scratchpad}"]
      ]);

      // Create ReAct agent with tools
      this.agent = await createReactAgent({
        llm: this.model,
        tools: this.tools,
        prompt: prompt
      });

      // Create agent executor
      this.agentExecutor = new AgentExecutor({
        agent: this.agent,
        tools: this.tools,
        verbose: true,
        maxIterations: 10,
        returnIntermediateSteps: true
      });

      this.initialized = true;
      logger.info(`✅ CloverReActAgent initialized successfully for persona: ${config.persona}`);
    } catch (error) {
      logger.error("❌ Error initializing CloverReActAgent:", error);
      throw error;
    }
  }

  private getPersonaPrompt(persona: string): string {
    const basePrompt = `You are Claude, an AI assistant helping with Kansofy Platform's trade and finance operations.

Communication style:
- Be conversational and natural, like Claude Desktop
- Avoid excessive formatting, emojis, or structured templates
- Provide direct, helpful responses without unnecessary decoration
- Use clean markdown sparingly - only when it improves clarity
- Focus on being genuinely helpful rather than impressive

When using tools:
- Use tools to get real data when users ask questions
- Present findings naturally in your response
- Don't announce "I'm using tools" - just use them and share results
- Integrate data smoothly into conversational responses

Response approach:
- For greetings: Respond naturally and ask how you can help
- For help requests: Ask what specific task they need assistance with
- For data queries: Use tools and present findings conversationally
- Always be direct and avoid template-like responses

Available tools: search_documents, query_trades, track_vessel, get_dashboard, analyze_risk, get_financial_summary

Your perspective: `;

    const personaPrompts = {
      admin: `${basePrompt}You have system administrator access and can help with technical questions, system health, and operational metrics.`,

      management: `${basePrompt}You focus on strategic insights, KPIs, and high-level business intelligence for management decisions.`,

      finance: `${basePrompt}You specialize in financial analysis, P&L, margins, trading performance, and cash flow insights.`,

      operations: `${basePrompt}You help with operational efficiency, supply chain, logistics, and vessel tracking.`,

      risk: `${basePrompt}You focus on risk analysis, compliance, VaR calculations, and identifying potential issues.`
    };

    return personaPrompts[persona as keyof typeof personaPrompts] || personaPrompts.admin;
  }

  async processMessage(input: string): Promise<CloverAgentResult> {
    try {
      logger.info(`🤖 Processing message with persona agent (${this.config.persona}): "${input}"`);
      
      // Initialize agent if not already done
      if (!this.initialized) {
        await this.initializeAgent(this.config);
      }

      if (!this.agentExecutor) {
        throw new Error('Agent executor not initialized');
      }
      
      // Extended Thinking is now supported through ExtendedThinkingChatAnthropic wrapper
      
      let result;
      try {
        result = await this.agentExecutor.invoke({
          input: input
        });
      } catch (parseError: any) {
        // Handle OUTPUT_PARSING_FAILURE - the LLM responded but not in ReAct format
        if (parseError.message?.includes('Could not parse LLM output')) {
          logger.warn('⚠️ ReAct format parsing failed, extracting direct response');
          
          // Extract the actual response from the error message
          const errorMessage = parseError.message;
          const llmOutputMatch = errorMessage.match(/Could not parse LLM output: ([\s\S]*?)(?:\n\nTroubleshooting URL:|$)/);
          
          if (llmOutputMatch && llmOutputMatch[1]) {
            const directResponse = llmOutputMatch[1].trim();
            
            // Return as a valid result without tool usage
            return {
              output: AgentResponseProcessor.processResponse(directResponse, {
                persona: this.config.persona,
                removeReActFormat: false,
                addTimestamp: true,
                enhanceFormatting: true
              }),
              intermediateSteps: [],
              toolsUsed: []
            };
          }
        }
        
        // Re-throw if it's a different kind of error
        throw parseError;
      }

      // Extract tools used from intermediate steps
      const toolsUsed = result.intermediateSteps ? 
        result.intermediateSteps.map((step: any) => step.action?.tool || 'unknown') : [];

      logger.info(`✅ Agent execution completed. Tools used: ${toolsUsed.join(', ')}`);

      // Process the output to clean up formatting
      const processedOutput = AgentResponseProcessor.processResponse(
        result.output || '',
        {
          persona: this.config.persona,
          removeReActFormat: true,
          addTimestamp: false,  // No timestamps - more like Claude Desktop
          enhanceFormatting: true
        }
      );

      return {
        output: processedOutput,
        intermediateSteps: result.intermediateSteps || [],
        toolsUsed
      };
    } catch (error) {
      logger.error("❌ Error processing message:", error);
      throw error;
    }
  }

  // Stream processing for real-time responses (compatible with Enhanced Clover)
  async streamMessage(input: string): Promise<Readable> {
    const readable = new Readable({
      read() {},
    });

    try {
      // Start streaming response
      readable.push(`data: ${JSON.stringify({ type: 'start' })}\n\n`);
      
      // Process with ReAct agent
      const result = await this.processMessage(input);
      
      // Stream the final output (already processed by processMessage)
      readable.push(`data: ${JSON.stringify({ 
        type: 'text', 
        text: result.output, // Already processed with proper formatting
        metadata: {
          toolsUsed: result.toolsUsed,
          persona: this.config.persona
        }
      })}\n\n`);
      
      // End stream
      readable.push(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
      // Send [DONE] marker for proper stream termination
      readable.push(`data: [DONE]\n\n`);
      readable.push(null);

    } catch (error) {
      logger.error("❌ Error streaming message:", error);
      readable.push(`data: ${JSON.stringify({ 
        type: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      })}\n\n`);
      // Send [DONE] marker even on error for proper stream termination
      readable.push(`data: [DONE]\n\n`);
      readable.push(null);
    }

    return readable;
  }

  getAvailableTools(): string[] {
    return this.tools.map(tool => tool.name);
  }

  getPersona(): string {
    return this.config.persona;
  }
}
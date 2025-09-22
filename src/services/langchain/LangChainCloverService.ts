import { Readable } from 'stream';
import { logger } from '../../utils/logger';
import { CloverReActAgent, CloverAgentConfig, CloverAgentResult } from './CloverReActAgent';
import { CloverMemoryService } from '../cloverMemoryService';
import { ExtendedThinkingService } from '../extendedThinkingService';
import { PromptCachingService } from '../promptCachingService';
import { CitationsService } from '../citationsService';
import { ChatMessage } from '../../types';
import { deepAgentOrchestrator } from './deepAgents/orchestration/DeepAgentOrchestrator';
import { queryClassifier } from './deepAgents/classification/QueryIntentClassifier';
import { tradeBookingDetector } from './utils/TradeBookingDetector';
import { tradeBookingService } from './services/TradeBookingService';
import { errorRecoveryService, ErrorContext } from '../errorRecoveryService';
import { businessContextService } from '../businessContextService';

export interface LangChainCloverOptions {
  sessionId?: string;
  userId?: string;
  personaId?: 'admin' | 'management' | 'finance' | 'operations' | 'risk';
  enableMemory?: boolean;
  enableLearning?: boolean;
  temperature?: number;
  maxTokens?: number;
  extendedThinking?: {
    enabled?: boolean;
    budgetTokens?: number;
    includeInResponse?: boolean;
  };
  citations?: {
    enabled?: boolean;
    includeInlineRefs?: boolean;
    citationFormat?: 'inline' | 'numbered' | 'bracketed';
    confidenceThreshold?: number;
  };
}

export class LangChainCloverService {
  private memoryService: CloverMemoryService;
  private extendedThinkingService: ExtendedThinkingService;
  private promptCachingService: PromptCachingService;
  private citationsService: CitationsService;
  private agentCache: Map<string, CloverReActAgent> = new Map();

  constructor() {
    // Initialize services in parallel for faster startup
    this.initializeServicesParallel();
    logger.info('LangChain Clover Service initializing with parallel service loading...');
  }

  /**
   * Initialize all services in parallel for better performance
   */
  private async initializeServicesParallel(): Promise<void> {
    const startTime = Date.now();
    
    // Create services immediately (synchronous)
    this.memoryService = new CloverMemoryService();
    this.extendedThinkingService = new ExtendedThinkingService();
    this.promptCachingService = new PromptCachingService();
    this.citationsService = new CitationsService();
    
    // If services have async initialization, do it in parallel
    try {
      await Promise.all([
        // Add any async initialization here if needed
        // this.memoryService.initialize?.(),
        // this.extendedThinkingService.initialize?.(),
        Promise.resolve() // Placeholder
      ]);
      
      // Optimize cache on startup
      this.optimizeCacheOnStartup();
      
      logger.info(`LangChain Clover Service initialized in ${Date.now() - startTime}ms with ReAct agents`);
    } catch (error) {
      logger.error('Failed to initialize some services:', error);
      // Services can still work with defaults
    }
  }

  /**
   * Optimize cache settings on startup
   */
  private optimizeCacheOnStartup(): void {
    try {
      // Analyze current cache patterns
      const analysis = this.promptCachingService.analyzeCachePatterns();
      
      if (analysis.recommendations.length > 0) {
        logger.info('Cache optimization recommendations:', analysis.recommendations);
      }
      
      // Auto-tune cache parameters
      const tuning = this.promptCachingService.autoTuneCacheParameters();
      if (Object.keys(tuning.adjustments).length > 0) {
        logger.info('Cache auto-tuning applied:', tuning.reasoning);
      }
      
      // Log cache ROI for monitoring
      const roi = this.promptCachingService.calculateCacheROI();
      logger.info(`Cache ROI: ${roi.roi.toFixed(1)}%, Break-even: ${roi.breakEvenRequests} requests`);
      
    } catch (error) {
      logger.error('Cache optimization failed:', error);
      // Continue without optimization
    }
  }

  /**
   * Enhanced chat using LangChain ReAct agents
   */
  async enhancedChat(
    messages: ChatMessage[],
    options: LangChainCloverOptions = {}
  ): Promise<Readable> {
    const startTime = Date.now();
    
    try {
      const {
        sessionId = `session_${Date.now()}`,
        userId = 'default_user',
        personaId = 'admin',
        enableMemory = true,
        enableLearning = true,
        temperature = 0.7,
        maxTokens = 4096
      } = options;

      logger.info(`Starting LangChain enhanced chat session: ${sessionId} (persona: ${personaId})`);
      
      // Preload cache for persona if not already done
      const cacheKey = `preloaded_${personaId}`;
      if (!this.agentCache.has(cacheKey)) {
        this.promptCachingService.preloadFrequentComponents(personaId, 'claude-3-5-sonnet-20241022')
          .catch(err => logger.warn('Cache preload failed:', err));
        this.agentCache.set(cacheKey, null as any); // Mark as preloaded
      }

      const userMessage = messages[messages.length - 1]?.content || '';
      
      // Check if it's smalltalk - handle directly without agent for instant response
      const lowerMessage = userMessage.toLowerCase().trim();
      logger.info(`Checking message: "${userMessage}" (lower: "${lowerMessage}")`);
      
      // Expanded smalltalk detection for better differentiation
      const isSmallTalk = this.isSmallTalkQuery(lowerMessage);
      
      if (isSmallTalk) {
        logger.info('💬 Smalltalk detected, using fast-path response');
        
        const smallTalkResponse = this.generateSmallTalkResponse(userMessage, personaId);
        
        // Create a simple stream for smalltalk with instant response
        const readable = this.createEnhancedStream({
          response: smallTalkResponse,
          toolsUsed: [],
          personaId,
          sessionId,
          intermediateSteps: [],
          extendedThinking: { enabled: false },
          executionTime: Date.now() - startTime,
          metadata: { responseType: 'smalltalk', fastPath: true }
        });
        
        return readable;
      }
      
      // Step 1: Memory Retrieval (if enabled)
      let memoryContext = null;
      if (enableMemory) {
        memoryContext = await this.memoryService.getMemoryContext(
          userMessage, sessionId, personaId, 10
        );
        logger.info(`Retrieved memory context: ${memoryContext?.similar_interactions?.length || 0} similar interactions`);
      }

      // Step 2: Trade Booking Detection
      const tradeBookingMatch = tradeBookingDetector.detectTradeBooking(userMessage);
      if (tradeBookingMatch.isTradeBooking) {
        logger.info(`🔨 Trade booking command detected (confidence: ${tradeBookingMatch.confidence})`);
        
        // Check permissions
        const hasPermission = await tradeBookingService.checkTradeBookingPermission(userId, personaId);
        if (!hasPermission) {
          const stream = new Readable({
            read() {}
          });
          
          process.nextTick(() => {
            stream.push(`data: ${JSON.stringify({
              type: 'message',
              content: `❌ **Access Denied**\n\nYour persona (${personaId}) does not have permission to book trades.\n\nAllowed personas: admin, finance, management`
            })}\n\n`);
            stream.push(null);
          });
          
          return stream;
        }
        
        // Execute trade booking workflow
        try {
          const bookingResult = await tradeBookingService.bookTrade({
            userMessage,
            userId,
            personaId,
            sessionId,
            extractedInfo: tradeBookingMatch.extractedInfo
          });
          
          const stream = new Readable({
            read() {}
          });
          
          process.nextTick(() => {
            stream.push(`data: ${JSON.stringify({
              type: 'message',
              content: bookingResult.message
            })}\n\n`);
            
            if (bookingResult.success && bookingResult.workflowId) {
              stream.push(`data: ${JSON.stringify({
                type: 'metadata',
                workflowId: bookingResult.workflowId,
                tradeBooking: true
              })}\n\n`);
            }
            
            stream.push(null);
          });
          
          return stream;
          
        } catch (error) {
          logger.error('Trade booking execution failed:', error);
          // Fall through to normal processing with error context
        }
      }

      // Step 3: Extended Thinking Assessment
      const complexity = this.assessQueryComplexity(userMessage);
      const extendedThinkingResult = this.extendedThinkingService.shouldEnableExtendedThinking({
        model: 'claude-3-5-sonnet-20241022',
        complexity,
        personaId,
        userPreference: options.extendedThinking,
      });

      logger.info(`Extended Thinking decision: ${extendedThinkingResult.reasoning}`);
      
      // Log Extended Thinking details if enabled
      if (extendedThinkingResult.enabled) {
        logger.info(`🧠 Extended Thinking enabled: ${extendedThinkingResult.budgetTokens} tokens budget`);
      }

      // Step 4: Query Classification for Deep Agent Routing
      const classification = queryClassifier.classify(userMessage);
      logger.info(`Query classification: complexity=${classification.complexity}, domains=[${classification.domains.join(', ')}], type=${classification.queryType}`);

      // Step 4.5: Analyze business context
      const businessContext = businessContextService.analyzeBusinessContext(userMessage, personaId);
      logger.info(`Business context: confidence=${businessContext.confidence.toFixed(2)}, ` +
                  `domains=[${businessContext.domains.join(',')}], keywords=${businessContext.keywords.length}`);

      // Step 5: Route to Deep Agents for Complex Financial Queries
      let agentResult: CloverAgentResult;
      let attemptNumber = 0;
      let lastError: Error | null = null;
      
      // Error recovery loop
      while (attemptNumber < 3) {
        try {
          attemptNumber++;
          
          // Increased threshold from 0.6 to 0.8 for better performance on simple queries
          if (classification.complexity > 0.8 || classification.domains.some(d => ['positions', 'pnl', 'cash', 'risk'].includes(d))) {
            logger.info(`🚀 Routing to Deep Agent Orchestrator (complexity: ${classification.complexity})`);
            
            const deepAgentResult = await deepAgentOrchestrator.orchestrate({
              query: userMessage,
              persona: personaId,
              options: {
                useDeepAgents: true,
                forceValidation: classification.validationRequired,
                progressiveResponse: false,
                maxResponseTime: 30000
              }
            });

            agentResult = {
              output: `## 🤖 Deep Agent Analysis\n\n${deepAgentResult.response}`,
              intermediateSteps: [],
              toolsUsed: deepAgentResult.agentsUsed,
              thinkingContent: `Used Deep Agents: ${deepAgentResult.agentsUsed.join(', ')}\nData Sources: ${deepAgentResult.dataSourcesAccessed.join(', ')}\nExecution Time: ${deepAgentResult.executionTime}ms`
            };

            logger.info(`✅ Deep Agent orchestration completed in ${deepAgentResult.executionTime}ms`);
          } else {
            // Step 6: Process with Regular ReAct Agent for Simple Queries
            logger.info(`📝 Using regular ReAct agent (complexity: ${classification.complexity})`);
            const agent = this.getAgentForPersona(personaId, {
              temperature,
              maxTokens,
              extendedThinking: extendedThinkingResult.enabled ? {
                enabled: true,
                budgetTokens: extendedThinkingResult.budgetTokens,
                includeInResponse: options.extendedThinking?.includeInResponse
              } : undefined
            });
            
            agentResult = await agent.processMessage(userMessage);
          }
          
          // Success - break out of retry loop
          break;
          
        } catch (error) {
          lastError = error as Error;
          
          // Create error context
          const errorContext: ErrorContext = {
            error,
            query: userMessage,
            personaId,
            sessionId,
            attemptNumber,
            toolsUsed: []
          };
          
          // Record error for circuit breaker
          errorRecoveryService.recordError(errorContext);
          
          // Get recovery strategy
          const recoveryStrategy = errorRecoveryService.getRecoveryStrategy(errorContext);
          
          if (recoveryStrategy.shouldRetry && attemptNumber < recoveryStrategy.maxRetries) {
            logger.warn(`Attempt ${attemptNumber} failed, retrying in ${recoveryStrategy.retryDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, recoveryStrategy.retryDelay));
            continue;
          }
          
          // Use fallback response if available
          if (recoveryStrategy.fallbackResponse) {
            logger.info('Using error recovery fallback response');
            agentResult = {
              output: businessContext.hasBusinessContext 
                ? businessContextService.enhanceResponseWithContext(
                    recoveryStrategy.fallbackResponse,
                    businessContext,
                    personaId
                  )
                : recoveryStrategy.fallbackResponse,
              intermediateSteps: [],
              toolsUsed: []
            };
            break;
          }
          
          // If agent processing fails with parse error, use business context fallback
          if (error instanceof Error && error.message.includes('Could not parse LLM output')) {
            logger.warn('ReAct agent parsing failed, using business context fallback');
            
            const fallbackResponse = businessContext.hasBusinessContext
              ? businessContextService.generateContextAwareFallback(userMessage, personaId, businessContext)
              : this.generateFallbackResponse(userMessage, personaId);
              
            agentResult = {
              output: fallbackResponse,
              intermediateSteps: [],
              toolsUsed: []
            };
            break;
          }
          
          // No recovery possible - throw error
          throw error;
        }
      }
      
      // If we exhausted all retries, use final fallback
      if (!agentResult && lastError) {
        logger.error('All retry attempts failed, using final fallback');
        agentResult = {
          output: businessContext.hasBusinessContext
            ? businessContextService.generateContextAwareFallback(userMessage, personaId, businessContext)
            : this.generateFallbackResponse(userMessage, personaId),
          intermediateSteps: [],
          toolsUsed: []
        };
      }

      // Step 6: Validate agent result
      if (!agentResult || !agentResult.output) {
        logger.error('Agent result is null or has no output');
        agentResult = {
          output: this.generateFallbackResponse(userMessage, personaId),
          intermediateSteps: [],
          toolsUsed: []
        };
      }

      // Step 6.5: Enhance response with business context
      if (businessContext.hasBusinessContext && agentResult.output) {
        // Validate business relevance
        const isRelevant = businessContextService.validateBusinessRelevance(
          agentResult.output,
          businessContext
        );
        
        if (!isRelevant) {
          logger.warn('Response lacks business relevance, enhancing...');
          agentResult.output = businessContextService.enhanceResponseWithContext(
            agentResult.output,
            businessContext,
            personaId
          );
        }
      }

      // Step 7: Citations Processing (if enabled)
      let citedResponse = agentResult.output;
      let citations: any[] = [];
      
      if (options.citations?.enabled && agentResult.output) {
        try {
          // Create citations based on tools used OR Deep Agents used
          const allTools = [...(agentResult.toolsUsed || [])];
          
          // Check if Deep Agents were used (from the response)
          if (agentResult.output.includes('Deep Agent')) {
            // Extract Deep Agent names from the response
            const agentMatches = agentResult.output.match(/Used Deep Agents: ([^\n]+)/);
            if (agentMatches && agentMatches[1]) {
              const deepAgents = agentMatches[1].split(', ');
              allTools.push(...deepAgents);
            }
          }
          
          if (allTools.length > 0) {
            logger.info(`Adding citations based on ${allTools.length} tools/agents used`);
            
            // Create mock citations based on tools that were actually used
            const mockCitations = this.createMockCitations(allTools, personaId);
            
            if (mockCitations.length > 0) {
              // Add citation references to the response
              citedResponse = agentResult.output + '\n\n---\n*Data sources: ';
              citedResponse += mockCitations.map(c => c.source).join(', ');
              citedResponse += '*';
              
              citations = mockCitations;
              logger.info(`Added ${citations.length} citations to response`);
            }
          }
        } catch (citationError) {
          logger.error('Citation processing failed:', citationError);
          // Keep original response if citation processing fails
        }
      }

      // Ensure we have a valid response before proceeding
      if (!citedResponse) {
        logger.error('Cited response is null, using fallback');
        citedResponse = this.generateFallbackResponse(userMessage, personaId);
      }

      // Step 8: Memory Recording (if enabled)
      if (enableMemory && enableLearning && citedResponse) {
        try {
          await this.memoryService.recordInteraction({
            sessionId,
            userId,
            personaId,
            userMessage,
            assistantResponse: citedResponse,
            context: {
              timestamp: new Date(),
              tools_used: agentResult.toolsUsed || [],
              data_sources_accessed: agentResult.toolsUsed || [],
              complexity_score: complexity,
              confidence_score: 0.8,
              response_quality: 0.9
            },
            metadata: {
              message_type: (agentResult.toolsUsed?.length || 0) > 0 ? 'action' : 'query',
              complexity_level: complexity > 0.7 ? 'complex' : complexity > 0.4 ? 'medium' : 'simple'
            }
          });
        } catch (memoryError) {
          logger.error('Failed to record interaction in memory:', memoryError);
          // Continue execution even if memory recording fails
        }
      }

      // Step 9: Create Enhanced Stream Response
      const readable = this.createEnhancedStream({
        response: citedResponse,
        toolsUsed: agentResult.toolsUsed,
        personaId,
        sessionId,
        intermediateSteps: agentResult.intermediateSteps,
        extendedThinking: extendedThinkingResult,
        executionTime: Date.now() - startTime,
        citations: citations.length > 0 ? citations : undefined,
        businessContext: businessContext.hasBusinessContext ? businessContext : undefined
      });

      return readable;

    } catch (error) {
      logger.error('LangChain enhanced chat error:', error);
      throw error;
    }
  }

  /**
   * Get or create a ReAct agent for a specific persona
   */
  private getAgentForPersona(
    personaId: string, 
    config: { temperature: number; maxTokens: number; extendedThinking?: any }
  ): CloverReActAgent {
    // Include Extended Thinking in cache key if enabled
    const etKey = config.extendedThinking ? `_et${config.extendedThinking.budgetTokens}` : '';
    const cacheKey = `${personaId}_${config.temperature}_${config.maxTokens}${etKey}`;
    
    if (!this.agentCache.has(cacheKey)) {
      const agentConfig: CloverAgentConfig = {
        persona: personaId as any,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        extendedThinking: config.extendedThinking
      };

      const agent = new CloverReActAgent(agentConfig);
      this.agentCache.set(cacheKey, agent);
      
      logger.info(`Created new ReAct agent for persona: ${personaId}${etKey ? ' with Extended Thinking' : ''}`);
    }

    return this.agentCache.get(cacheKey)!;
  }

  /**
   * Assess query complexity for Extended Thinking trigger
   */
  private assessQueryComplexity(query: string): number {
    let complexity = 0.3; // Base complexity

    const complexityIndicators = [
      { pattern: /\b(analyze|analysis|comprehensive|detailed)\b/i, weight: 0.15 },
      { pattern: /\b(compare|comparison|versus|vs)\b/i, weight: 0.1 },
      { pattern: /\b(optimize|optimization|improve|enhancement)\b/i, weight: 0.15 },
      { pattern: /\b(strategy|strategic|planning|forecast)\b/i, weight: 0.2 },
      { pattern: /\b(risk|var|stress|scenario)\b/i, weight: 0.15 },
      { pattern: /\b(multiple|several|various|different)\b/i, weight: 0.1 },
      { pattern: /\b(correlation|relationship|impact|effect)\b/i, weight: 0.1 },
      { pattern: /\b(why|how|what if|explain)\b/i, weight: 0.05 }
    ];

    for (const indicator of complexityIndicators) {
      if (indicator.pattern.test(query)) {
        complexity += indicator.weight;
      }
    }

    // Length-based complexity
    if (query.length > 200) complexity += 0.1;
    if (query.length > 500) complexity += 0.1;

    // Question complexity
    const questionCount = (query.match(/\?/g) || []).length;
    if (questionCount > 1) complexity += questionCount * 0.05;

    return Math.min(complexity, 1.0);
  }

  /**
   * Check if query is smalltalk
   */
  private isSmallTalkQuery(query: string): boolean {
    const smallTalkPatterns = [
      /^(hi|hello|hey|good morning|good afternoon|good evening|greetings)$/,
      /^how are you\??$/,
      /^what'?s up\??$/,
      /^how'?s it going\??$/,
      /^nice to (meet|see) you$/,
      /^thank you|thanks$/,
      /^you'?re welcome$/,
      /^(good)?bye|see you|talk to you later$/,
      /^have a (good|nice|great) (day|morning|afternoon|evening)$/
    ];
    
    return smallTalkPatterns.some(pattern => pattern.test(query));
  }

  /**
   * Generate smalltalk response based on persona
   */
  private generateSmallTalkResponse(query: string, personaId: string): string {
    const lowerQuery = query.toLowerCase();
    
    // Persona-specific greetings
    const personaGreetings = {
      admin: {
        hello: "Hey! Ready to dive into system metrics? 🔧",
        howAreYou: "Running at peak performance! How can I help optimize your systems today?",
        thanks: "You're welcome! Always here to keep things running smoothly.",
        bye: "Take care! I'll keep monitoring the systems for you."
      },
      management: {
        hello: "Good to see you! Ready for some strategic insights? 📊",
        howAreYou: "Excellent! The markets are active today. What strategic analysis can I provide?",
        thanks: "My pleasure! Strategic planning is what I do best.",
        bye: "Until next time! I'll have those reports ready when you return."
      },
      finance: {
        hello: "Hello! Ready to crunch some numbers? 💰",
        howAreYou: "Great! The numbers are looking interesting today. What financial analysis do you need?",
        thanks: "Happy to help! Accurate financial data is crucial.",
        bye: "Take care! I'll keep tracking those positions for you."
      },
      operations: {
        hello: "Hey there! Ready to optimize operations? ⚙️",
        howAreYou: "All systems operational! What logistics challenge can I help with?",
        thanks: "No problem! Smooth operations are my priority.",
        bye: "See you! I'll keep monitoring those shipments."
      },
      risk: {
        hello: "Greetings! Ready for risk analysis? 🛡️",
        howAreYou: "Vigilant as always! What risk factors should we examine today?",
        thanks: "You're welcome! Risk management is essential.",
        bye: "Stay safe! I'll continue monitoring risk indicators."
      }
    };
    
    const responses = personaGreetings[personaId as keyof typeof personaGreetings] || personaGreetings.admin;
    
    if (lowerQuery.match(/^(hi|hello|hey|good morning|good afternoon|good evening)/)) {
      return responses.hello;
    } else if (lowerQuery.match(/how are you|how'?s it going|what'?s up/)) {
      return responses.howAreYou;
    } else if (lowerQuery.match(/thank you|thanks/)) {
      return responses.thanks;
    } else if (lowerQuery.match(/bye|see you|talk to you later/)) {
      return responses.bye;
    } else {
      return responses.hello; // Default to greeting
    }
  }

  /**
   * Create mock citations based on tools used
   */
  private createMockCitations(toolsUsed: string[], personaId: string): any[] {
    const citations: any[] = [];
    
    const toolCitationMap = {
      'search_documents': {
        source: 'Document Intelligence System',
        excerpt: 'Data retrieved from verified contracts, invoices, and broker statements',
        confidence: 0.85,
        type: 'document_search'
      },
      'query_trades': {
        source: 'Trading Database',
        excerpt: 'Real-time position and P&L data from trading systems',
        confidence: 0.95,
        type: 'trading_data'
      },
      'analyze_risk': {
        source: 'Risk Management System',
        excerpt: 'VaR calculations and risk metrics from live risk engine',
        confidence: 0.9,
        type: 'risk_analysis'
      },
      'track_vessel': {
        source: 'Terminal49 Vessel Tracking',
        excerpt: 'Real-time vessel location and shipment status',
        confidence: 0.88,
        type: 'vessel_tracking'
      },
      'get_financial_summary': {
        source: 'Financial Reporting System',
        excerpt: 'Consolidated financial data and AR/AP summaries',
        confidence: 0.92,
        type: 'financial_data'
      },
      'get_dashboard': {
        source: 'Grafana Analytics',
        excerpt: 'Live dashboards and performance metrics',
        confidence: 0.87,
        type: 'dashboard_data'
      },
      'DataArchitectAgent': {
        source: 'Deep Agent Architecture Analysis',
        excerpt: 'Comprehensive system architecture and data flow analysis',
        confidence: 0.93,
        type: 'deep_agent'
      },
      'RawDataAnalystAgent': {
        source: 'Deep Agent Data Analysis',
        excerpt: 'Detailed data extraction and analysis from multiple sources',
        confidence: 0.91,
        type: 'deep_agent'
      },
      'ValidationAgent': {
        source: 'Deep Agent Validation',
        excerpt: 'Cross-validated data with quality assurance checks',
        confidence: 0.94,
        type: 'deep_agent'
      },
      'SynthesisAgent': {
        source: 'Deep Agent Synthesis',
        excerpt: 'Intelligent synthesis of multi-source data insights',
        confidence: 0.89,
        type: 'deep_agent'
      }
    };
    
    // Create citations for each tool used
    toolsUsed.forEach((tool, index) => {
      const citationInfo = toolCitationMap[tool as keyof typeof toolCitationMap];
      if (citationInfo) {
        citations.push({
          id: `${index + 1}`,
          source: citationInfo.source,
          excerpt: citationInfo.excerpt,
          confidence: citationInfo.confidence,
          relevance: 0.9,
          metadata: { 
            type: citationInfo.type, 
            persona: personaId,
            tool: tool,
            timestamp: new Date().toISOString()
          }
        });
      }
    });
    
    return citations;
  }

  /**
   * Generate a fallback response for simple queries that don't need tools
   */
  private generateFallbackResponse(query: string, personaId: string): string {
    const lowerQuery = query.toLowerCase();
    
    // Check if it's a greeting
    if (lowerQuery.match(/^(hi|hello|hey|good morning|good afternoon|good evening)/)) {
      const greetings = {
        admin: "Hey! What's up?",
        management: "Hi there! How can I help with strategic insights today?",
        finance: "Hello! Ready to dive into the numbers?",
        operations: "Hey! What operational challenge can I help with?",
        risk: "Hi! Let's talk about risk management."
      };
      return greetings[personaId as keyof typeof greetings] || greetings.admin;
    }
    
    // Check if it's asking about capabilities
    if (lowerQuery.includes('what can you do') || lowerQuery.includes('help') || lowerQuery.includes('capabilities')) {
      return `I'm Enhanced Clover AI with the ${personaId} persona. I can help you with:

**Available Capabilities:**
- 📄 **Document Search**: Search and analyze contracts, invoices, broker statements
- 📊 **Trade Analysis**: Query trading positions, P&L, and performance metrics
- 🚢 **Vessel Tracking**: Real-time vessel location and shipment status
- 📈 **Dashboard Access**: Retrieve Grafana visualizations and metrics
- ⚠️ **Risk Analysis**: Calculate VaR, exposure, and margin requirements
- 💰 **Financial Summaries**: AR/AP analysis and counterparty information

Simply ask me about any specific data or analysis you need!`;
    }
    
    // Default response for other general queries
    return `I understand you're asking: "${query}". To provide you with accurate information, I'll need to search our systems. Could you please be more specific about what data or analysis you're looking for? For example:

- "Show me our copper positions"
- "Search for contracts with ABC Corp"
- "Track vessel IMO 9876543"
- "Analyze risk exposure for Q3"

I have access to real-time data and can help with any specific queries about your operations, trades, or documents.`;
  }

  /**
   * Create enhanced stream response compatible with existing Enhanced Clover format
   */
  private createEnhancedStream(data: {
    response: string;
    toolsUsed: string[];
    personaId: string;
    sessionId: string;
    intermediateSteps: any[];
    extendedThinking: any;
    executionTime: number;
    metadata?: any;
    citations?: any[];
    businessContext?: any;
  }): Readable {
    const readable = new Readable({
      read() {},
    });

    // Send stream events in Enhanced Clover format
    setImmediate(async () => {
      try {
        // Start event
        readable.push(`data: ${JSON.stringify({ 
          type: 'start',
          persona: data.personaId,
          session: data.sessionId
        })}\n\n`);

        // Extended Thinking event (if enabled)
        if (data.extendedThinking && data.extendedThinking.enabled) {
          readable.push(`data: ${JSON.stringify({ 
            type: 'thinking',
            enabled: true,
            budgetTokens: data.extendedThinking.budgetTokens,
            message: '🧠 Extended Thinking activated for deep analysis...'
          })}\n\n`);
        }

        // Deep Agent indicator (if Deep Agents were used)
        if (data.toolsUsed.some(tool => tool.includes('Agent'))) {
          readable.push(`data: ${JSON.stringify({ 
            type: 'agent_status',
            message: '🤖 Deep Agent Analysis in progress...',
            agents: data.toolsUsed.filter(tool => tool.includes('Agent'))
          })}\n\n`);
        }

        // Tools used event with enhanced visualization
        if (data.toolsUsed.length > 0) {
          const toolIcons = {
            'search_documents': '📄',
            'query_trades': '📊',
            'track_vessel': '🚢',
            'get_dashboard': '📈',
            'analyze_risk': '⚠️',
            'get_financial_summary': '💰',
            'DataArchitectAgent': '🏗️',
            'RawDataAnalystAgent': '🔍',
            'ValidationAgent': '✅',
            'SynthesisAgent': '🎯'
          };
          
          const toolsWithIcons = data.toolsUsed.map(tool => 
            `${toolIcons[tool] || '🔧'} ${tool}`
          );
          
          readable.push(`data: ${JSON.stringify({ 
            type: 'tools_used',
            tools: data.toolsUsed,
            display: toolsWithIcons,
            message: `Using ${data.toolsUsed.length} specialized tools...`
          })}\n\n`);
        }

        // Stream response text in larger chunks for better performance
        // Increased chunk size for faster streaming while maintaining smooth UX
        const chunkSize = 200; // Increased from 10 to 200 characters per chunk
        const responseText = data.response;
        
        for (let i = 0; i < responseText.length; i += chunkSize) {
          const chunk = responseText.slice(i, Math.min(i + chunkSize, responseText.length));
          readable.push(`data: ${JSON.stringify({ 
            type: 'text', 
            text: chunk 
          })}\n\n`);
          
          // No artificial delay - let Node.js handle natural streaming
          // Only yield for very long responses to prevent blocking
          if (i > 0 && i % 1000 === 0) {
            await new Promise(resolve => setImmediate(resolve));
          }
        }

        // Send citations if available
        if (data.citations && data.citations.length > 0) {
          readable.push(`data: ${JSON.stringify({ 
            type: 'citation',
            citations: data.citations
          })}\n\n`);
        }

        // Completion event
        readable.push(`data: ${JSON.stringify({ 
          type: 'end',
          metadata: {
            execution_time: data.executionTime,
            tools_used: data.toolsUsed,
            persona: data.personaId,
            agent_type: 'langchain_react'
          }
        })}\n\n`);

        // Send [DONE] marker for proper stream termination
        readable.push(`data: [DONE]\n\n`);
        readable.push(null);
      } catch (error) {
        logger.error('Stream error:', error);
        readable.push(`data: ${JSON.stringify({ 
          type: 'error', 
          error: error instanceof Error ? error.message : 'Unknown error' 
        })}\n\n`);
        // Send [DONE] marker even on error for proper stream termination
        readable.push(`data: [DONE]\n\n`);
        readable.push(null);
      }
    });

    return readable;
  }

  /**
   * Get available capabilities
   */
  getCapabilities(): any {
    // Get cache metrics for capabilities response
    const cacheMetrics = this.promptCachingService.getAggregatedMetrics();
    const cacheOptimization = this.promptCachingService.analyzeCachePatterns();
    
    return {
      langchain_integration: {
        react_agents: true,
        tool_execution: 'real',
        personas: ['admin', 'management', 'finance', 'operations', 'risk']
      },
      tools: {
        search_documents: 'Real PostgreSQL + Qdrant search',
        query_trades: 'Real trading data queries',
        track_vessel: 'Real Terminal49 API integration',
        get_dashboard: 'Real Grafana dashboard URLs',
        analyze_risk: 'Real VaR and risk calculations',
        get_financial_summary: 'Real AR/AP and cash flow data'
      },
      features: {
        memory: true,
        extended_thinking: true,
        citations: true,
        persona_system: true,
        real_tool_execution: true,
        cache_optimization: true
      },
      cache_performance: {
        hit_rate: `${(cacheMetrics.hitRate * 100).toFixed(1)}%`,
        total_requests: cacheMetrics.totalRequests,
        cost_savings: cacheMetrics.costSavings.toFixed(2),
        optimization_potential: cacheOptimization.optimizationPotential.toFixed(2),
        high_value_keys: cacheOptimization.highValueKeys.length
      }
    };
  }
}
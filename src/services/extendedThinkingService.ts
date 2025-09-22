import { logger } from '../utils/logger';
import { ClaudeModel, supportsExtendedThinking, getExtendedThinkingType } from '../constants/models';

export interface ExtendedThinkingOptions {
  enabled: boolean;
  budgetTokens?: number; // Default: 10000, recommended 16k+ for complex tasks
  includeInResponse?: boolean; // Whether to include thinking in the response
}

export interface ExtendedThinkingConfig {
  model: ClaudeModel;
  complexity: number;
  personaId: string;
  userPreference?: ExtendedThinkingOptions;
}

export interface ThinkingResult {
  enabled: boolean;
  budgetTokens: number;
  thinkingType: 'full' | 'summarized' | null;
  reasoning: string;
}

export class ExtendedThinkingService {
  // Default budget tokens based on task complexity
  private readonly DEFAULT_BUDGETS = {
    simple: 5000,
    medium: 10000,
    complex: 16000,
    veryComplex: 25000,
  };

  // Persona-specific thinking preferences
  private readonly PERSONA_PREFERENCES: Record<string, { baseMultiplier: number; minBudget: number }> = {
    management: { baseMultiplier: 1.5, minBudget: 10000 },
    finance: { baseMultiplier: 1.3, minBudget: 8000 },
    operations: { baseMultiplier: 1.0, minBudget: 5000 },
    risk: { baseMultiplier: 1.8, minBudget: 12000 },
    admin: { baseMultiplier: 1.2, minBudget: 8000 },
  };

  /**
   * Determine if Extended Thinking should be enabled based on various factors
   */
  shouldEnableExtendedThinking(config: ExtendedThinkingConfig): ThinkingResult {
    const { model, complexity, personaId, userPreference } = config;

    // Check if model supports extended thinking
    if (!supportsExtendedThinking(model)) {
      return {
        enabled: false,
        budgetTokens: 0,
        thinkingType: null,
        reasoning: `Model ${model} does not support Extended Thinking`,
      };
    }

    // Check user preference override
    if (userPreference?.enabled === false) {
      return {
        enabled: false,
        budgetTokens: 0,
        thinkingType: null,
        reasoning: 'Extended Thinking disabled by user preference',
      };
    }

    // Determine if complexity warrants extended thinking
    const complexityThreshold = 0.6; // Matches DeepThinkingService threshold
    const shouldEnable = userPreference?.enabled === true || complexity >= complexityThreshold;

    if (!shouldEnable) {
      return {
        enabled: false,
        budgetTokens: 0,
        thinkingType: null,
        reasoning: `Query complexity (${complexity.toFixed(2)}) below threshold (${complexityThreshold})`,
      };
    }

    // Calculate budget tokens
    const budgetTokens = this.calculateBudgetTokens(complexity, personaId, userPreference?.budgetTokens);
    const thinkingType = getExtendedThinkingType(model);

    return {
      enabled: true,
      budgetTokens,
      thinkingType,
      reasoning: `Extended Thinking enabled for ${thinkingType} output with ${budgetTokens} token budget`,
    };
  }

  /**
   * Calculate appropriate budget tokens based on complexity and persona
   */
  private calculateBudgetTokens(complexity: number, personaId: string, userBudget?: number): number {
    // Use user-specified budget if provided
    if (userBudget && userBudget > 0) {
      return Math.min(userBudget, 50000); // Cap at 50k for safety
    }

    // Determine base budget from complexity
    let baseBudget: number;
    if (complexity >= 0.9) {
      baseBudget = this.DEFAULT_BUDGETS.veryComplex;
    } else if (complexity >= 0.7) {
      baseBudget = this.DEFAULT_BUDGETS.complex;
    } else if (complexity >= 0.5) {
      baseBudget = this.DEFAULT_BUDGETS.medium;
    } else {
      baseBudget = this.DEFAULT_BUDGETS.simple;
    }

    // Apply persona multiplier
    const personaConfig = this.PERSONA_PREFERENCES[personaId] || { baseMultiplier: 1.0, minBudget: 5000 };
    const adjustedBudget = Math.round(baseBudget * personaConfig.baseMultiplier);

    // Ensure minimum budget for persona
    return Math.max(adjustedBudget, personaConfig.minBudget);
  }

  /**
   * Format the thinking parameter for the Anthropic API
   */
  formatThinkingParameter(thinkingResult: ThinkingResult): any {
    if (!thinkingResult.enabled) {
      return undefined;
    }

    return {
      type: 'enabled',
      budget_tokens: thinkingResult.budgetTokens,
    };
  }

  /**
   * Process thinking output from the API response
   */
  processThinkingOutput(thinking: any, thinkingType: 'full' | 'summarized' | null): {
    summary: string;
    fullThinking?: string;
    tokenCount?: number;
  } {
    if (!thinking) {
      return { summary: 'No thinking output provided' };
    }

    // For Claude 4 models (summarized thinking)
    if (thinkingType === 'summarized') {
      return {
        summary: thinking.summary || 'Thinking process completed',
        tokenCount: thinking.token_count,
      };
    }

    // For Claude 3.7 (full thinking)
    if (thinkingType === 'full') {
      const fullThinking = thinking.content || '';
      const summary = this.extractThinkingSummary(fullThinking);
      
      return {
        summary,
        fullThinking,
        tokenCount: thinking.token_count,
      };
    }

    return { summary: 'Unknown thinking format' };
  }

  /**
   * Extract a summary from full thinking output
   */
  private extractThinkingSummary(fullThinking: string): string {
    // Look for key patterns in the thinking
    const lines = fullThinking.split('\n').filter(line => line.trim());
    
    // Try to find conclusion or summary sections
    const conclusionIndex = lines.findIndex(line => 
      line.toLowerCase().includes('conclusion') || 
      line.toLowerCase().includes('summary') ||
      line.toLowerCase().includes('therefore')
    );

    if (conclusionIndex >= 0) {
      // Return the conclusion and a few lines after
      return lines.slice(conclusionIndex, conclusionIndex + 3).join(' ').trim();
    }

    // Fallback: return the last few meaningful lines
    const meaningfulLines = lines.filter(line => line.length > 20);
    if (meaningfulLines.length > 0) {
      return meaningfulLines.slice(-2).join(' ').trim();
    }

    return 'Extended thinking process completed';
  }

  /**
   * Log Extended Thinking metrics for monitoring
   */
  logThinkingMetrics(
    sessionId: string,
    thinkingResult: ThinkingResult,
    executionTime: number,
    thinkingTokens?: number
  ): void {
    logger.info('Extended Thinking metrics', {
      sessionId,
      enabled: thinkingResult.enabled,
      budgetTokens: thinkingResult.budgetTokens,
      actualTokens: thinkingTokens,
      thinkingType: thinkingResult.thinkingType,
      executionTime,
      efficiency: thinkingTokens ? (thinkingTokens / thinkingResult.budgetTokens) : null,
    });
  }
}
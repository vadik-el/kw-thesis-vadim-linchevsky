/**
 * Agent Response Processor
 * 
 * Cleans up ReAct agent output and applies persona-specific formatting
 * Removes Thought/Action/Observation artifacts and ensures clean markdown
 */

import { logger } from '../../utils/logger';
import { ResponseFormatter } from '../../utils/responseFormatter';

export interface ProcessorOptions {
  persona: string;
  removeReActFormat?: boolean;
  addTimestamp?: boolean;
  enhanceFormatting?: boolean;
}

export class AgentResponseProcessor {
  /**
   * Process raw agent output to clean, formatted response
   */
  static processResponse(
    rawOutput: string,
    options: ProcessorOptions = {}
  ): string {
    const {
      persona = 'admin',
      removeReActFormat = true,
      addTimestamp = true,
      enhanceFormatting = true
    } = options;

    let processed = rawOutput;

    // Step 1: Remove ReAct format artifacts
    if (removeReActFormat) {
      processed = this.removeReActArtifacts(processed);
    }

    // Step 2: Enhance formatting
    if (enhanceFormatting) {
      processed = this.enhanceFormatting(processed);
    }

    // Step 3: Apply persona-specific styling
    processed = this.applyPersonaStyling(processed, persona);

    // Step 4: Add timestamp if needed
    if (addTimestamp && !processed.includes('Last Updated:')) {
      processed += `\n\n${ResponseFormatter.createDivider()}\n${ResponseFormatter.createTimestamp()}`;
    }

    return processed.trim();
  }

  /**
   * Remove ReAct format artifacts (Thought/Action/Observation)
   */
  private static removeReActArtifacts(text: string): string {
    // Remove Thought/Action/Observation patterns
    let cleaned = text;

    // Pattern 1: Remove "Thought: ..." lines
    cleaned = cleaned.replace(/^Thought:.*$/gm, '');

    // Pattern 2: Remove "Action: ..." lines
    cleaned = cleaned.replace(/^Action:.*$/gm, '');

    // Pattern 3: Remove "Action Input: ..." lines
    cleaned = cleaned.replace(/^Action Input:.*$/gm, '');

    // Pattern 4: Remove "Observation: ..." lines
    cleaned = cleaned.replace(/^Observation:.*$/gm, '');

    // Pattern 5: Extract content after "Final Answer:"
    const finalAnswerMatch = cleaned.match(/Final Answer:\s*([\s\S]*?)(?=\n\n|$)/);
    if (finalAnswerMatch) {
      cleaned = finalAnswerMatch[1].trim();
    }

    // Pattern 6: Remove multiple consecutive newlines
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    // Pattern 7: Remove leading/trailing whitespace
    cleaned = cleaned.trim();

    return cleaned;
  }

  /**
   * Enhance formatting for better markdown rendering
   */
  private static enhanceFormatting(text: string): string {
    let enhanced = text;

    // Fix common formatting issues
    // 1. Ensure headers have proper spacing
    enhanced = enhanced.replace(/^(#{1,6})\s*(.+)$/gm, '$1 $2');
    enhanced = enhanced.replace(/([^\n])\n(#{1,6}\s)/g, '$1\n\n$2');

    // 2. Fix list formatting
    enhanced = enhanced.replace(/^(\s*[-*+])\s+/gm, '$1 ');
    enhanced = enhanced.replace(/([^\n])\n(\s*[-*+]\s)/g, '$1\n\n$2');

    // 3. Ensure tables have proper spacing
    enhanced = enhanced.replace(/([^\n])\n(\|)/g, '$1\n\n$2');
    enhanced = enhanced.replace(/(\|[^\n]+\|)\n([^|\-])/g, '$1\n\n$2');

    // 4. Fix inline code formatting
    enhanced = enhanced.replace(/`([^`]+)`/g, '`$1`');

    // 5. Ensure proper paragraph spacing
    enhanced = enhanced.replace(/([.!?])\n([A-Z])/g, '$1\n\n$2');

    return enhanced;
  }

  /**
   * Apply persona-specific styling and enhancements
   */
  private static applyPersonaStyling(text: string, persona: string): string {
    switch (persona) {
      case 'finance':
        return this.applyFinancePersonaStyling(text);
      case 'risk':
        return this.applyRiskPersonaStyling(text);
      case 'management':
        return this.applyManagementPersonaStyling(text);
      case 'operations':
        return this.applyOperationsPersonaStyling(text);
      case 'admin':
      default:
        return this.applyAdminPersonaStyling(text);
    }
  }

  /**
   * Finance persona styling - emphasis on numbers and calculations
   */
  private static applyFinancePersonaStyling(text: string): string {
    // Return text as-is without excessive bolding
    return text;
  }

  /**
   * Risk persona styling - emphasis on warnings and risk levels
   */
  private static applyRiskPersonaStyling(text: string): string {
    // Add risk warnings for high-risk situations only
    if (text.match(/\b(high risk|critical|severe)\b/i) && !text.includes('RISK ALERT')) {
      text = `⚠️ **RISK ALERT**: Critical risk factors identified\n\n${text}`;
    }

    return text;
  }

  /**
   * Management persona styling - executive summary focus
   */
  private static applyManagementPersonaStyling(text: string): string {
    // Add key takeaways section if substantial content
    if (text.length > 500 && !text.includes('Key Takeaways')) {
      const keyPoints = this.extractKeyPoints(text);
      if (keyPoints.length > 0) {
        text = `${text}\n\n### 🎯 Key Takeaways\n${keyPoints.map(p => `- ${p}`).join('\n')}`;
      }
    }

    return text;
  }

  /**
   * Operations persona styling - action-oriented formatting
   */
  private static applyOperationsPersonaStyling(text: string): string {
    // Return text as-is without excessive bolding
    return text;
  }

  /**
   * Admin persona styling - system and technical focus
   */
  private static applyAdminPersonaStyling(text: string): string {
    // Return text as-is without excessive bolding
    return text;
  }

  /**
   * Extract key points from text for executive summaries
   */
  private static extractKeyPoints(text: string): string[] {
    const keyPoints: string[] = [];

    // Look for sentences with key indicators
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    
    for (const sentence of sentences) {
      if (sentence.match(/\b(total|overall|summary|result|conclusion|important|critical|key)\b/i)) {
        const cleaned = sentence.trim().replace(/\n/g, ' ');
        if (cleaned.length > 20 && cleaned.length < 200) {
          keyPoints.push(cleaned);
        }
      }
    }

    // Limit to top 3-5 points
    return keyPoints.slice(0, Math.min(5, keyPoints.length));
  }

  /**
   * Validate the processed output
   */
  static validateOutput(text: string): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check for remaining ReAct artifacts
    if (text.match(/^(Thought|Action|Observation):/m)) {
      issues.push('ReAct format artifacts still present');
    }

    // Check for malformed markdown
    if (text.match(/\n#{1,6}[^\s]/)) {
      issues.push('Malformed headers (missing space after #)');
    }

    // Check for excessive newlines
    if (text.match(/\n{4,}/)) {
      issues.push('Excessive newlines detected');
    }

    // Check for unclosed markdown elements
    const codeBlocks = (text.match(/```/g) || []).length;
    if (codeBlocks % 2 !== 0) {
      issues.push('Unclosed code blocks');
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }
}
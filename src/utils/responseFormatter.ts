/**
 * Response Formatter Utility
 * 
 * Provides consistent formatting for financial data in markdown-friendly format
 * Handles currency, numbers, percentages, dates, and visual indicators
 */

export class ResponseFormatter {
  /**
   * Format currency with proper symbol and thousands separators
   */
  static formatCurrency(value: number | string, showSign: boolean = false): string {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    
    if (isNaN(num)) return 'N/A';
    
    const isNegative = num < 0;
    const absValue = Math.abs(num);
    
    // Format with commas
    const formatted = absValue.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
    
    // Add sign and styling
    if (showSign && num !== 0) {
      const sign = isNegative ? '-' : '+';
      return `**${sign}${formatted}**`;
    }
    
    return isNegative ? `-${formatted}` : formatted;
  }

  /**
   * Format large numbers with abbreviations (K, M, B)
   */
  static formatLargeNumber(value: number | string): string {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    
    if (isNaN(num)) return 'N/A';
    
    const absValue = Math.abs(num);
    
    if (absValue >= 1e9) {
      return `${(num / 1e9).toFixed(1)}B`;
    } else if (absValue >= 1e6) {
      return `${(num / 1e6).toFixed(1)}M`;
    } else if (absValue >= 1e3) {
      return `${(num / 1e3).toFixed(0)}K`;
    }
    
    return num.toLocaleString('en-US');
  }

  /**
   * Format number with thousands separators
   */
  static formatNumber(value: number | string, decimals: number = 0): string {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    
    if (isNaN(num)) return 'N/A';
    
    return num.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  /**
   * Format percentage with optional sign
   */
  static formatPercentage(value: number | string, showSign: boolean = false): string {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    
    if (isNaN(num)) return 'N/A';
    
    const formatted = `${num.toFixed(2)}%`;
    
    if (showSign && num !== 0) {
      const sign = num > 0 ? '+' : '';
      return `${sign}${formatted}`;
    }
    
    return formatted;
  }

  /**
   * Format date to readable format
   */
  static formatDate(date: Date | string, includeTime: boolean = false): string {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    if (isNaN(dateObj.getTime())) return 'N/A';
    
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    
    if (includeTime) {
      options.hour = 'numeric';
      options.minute = '2-digit';
      options.timeZoneName = 'short';
    }
    
    return dateObj.toLocaleDateString('en-US', options);
  }

  /**
   * Get status indicator emoji based on value
   */
  static getStatusIndicator(value: number): string {
    if (value > 0) return '🟢';
    if (value < 0) return '🔴';
    return '⚪';
  }

  /**
   * Get directional arrow based on value
   */
  static getDirectionalArrow(value: number): string {
    if (value > 0) return '↑';
    if (value < 0) return '↓';
    return '→';
  }

  /**
   * Get risk level indicator
   */
  static getRiskIndicator(level: 'low' | 'moderate' | 'high' | 'critical'): string {
    const indicators = {
      low: '🟢 Low',
      moderate: '🟡 Moderate',
      high: '🟠 High',
      critical: '🔴 Critical'
    };
    
    return indicators[level] || '⚪ Unknown';
  }

  /**
   * Format P&L with color and sign
   */
  static formatPnL(value: number | string, includePercentage?: number): string {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    
    if (isNaN(num)) return 'N/A';
    
    const formatted = this.formatCurrency(num, true);
    const indicator = this.getStatusIndicator(num);
    
    if (includePercentage !== undefined && !isNaN(includePercentage)) {
      const percentFormatted = this.formatPercentage(includePercentage, true);
      return `${formatted} ${indicator} ${percentFormatted}`;
    }
    
    return `${formatted} ${indicator}`;
  }

  /**
   * Create a progress bar for percentages
   */
  static createProgressBar(percentage: number, width: number = 20): string {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    
    const filledChar = '█';
    const emptyChar = '░';
    
    return `[${filledChar.repeat(filled)}${emptyChar.repeat(empty)}] ${percentage.toFixed(1)}%`;
  }

  /**
   * Format commodity name with symbol
   */
  static formatCommodity(name: string, symbol?: string): string {
    if (symbol) {
      return `**${name}** (${symbol})`;
    }
    return `**${name}**`;
  }

  /**
   * Create a visual meter (like for margin utilization)
   */
  static createVisualMeter(value: number, thresholds: { warning: number; critical: number }): string {
    let status = '🟢';
    let label = 'Normal';
    
    if (value >= thresholds.critical) {
      status = '🔴';
      label = 'Critical';
    } else if (value >= thresholds.warning) {
      status = '🟡';
      label = 'Warning';
    }
    
    return `${status} ${value.toFixed(1)}% (${label})`;
  }

  /**
   * Format a key-value pair for display
   */
  static formatKeyValue(key: string, value: string): string {
    return `**${key}**: ${value}`;
  }

  /**
   * Create a section divider
   */
  static createDivider(): string {
    return '\n---\n';
  }

  /**
   * Create a timestamp footer
   */
  static createTimestamp(): string {
    return `*Last Updated: ${this.formatDate(new Date(), true)}*`;
  }
}
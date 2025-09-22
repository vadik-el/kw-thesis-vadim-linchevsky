import { DynamicTool } from "@langchain/core/tools";
import { QueryService } from '../../queryService';
import { logger } from '../../../utils/logger';
import { ResponseFormatter } from '../../../utils/responseFormatter';
import { MarkdownTableBuilder, TableColumn } from '../../../utils/markdownTableBuilder';
import { LangChainToolFactory } from '../../standardizedToolInterface';

export class QueryTradesTool extends DynamicTool {
  private queryService: QueryService;

  constructor() {
    // Create tool using standardized interface from unified registry
    const standardizedTool = LangChainToolFactory.createTool(
      'query_trades',
      async (input) => await QueryTradesTool.executeQuery(input)
    );

    if (!standardizedTool) {
      throw new Error('Failed to create QueryTradesTool from unified registry');
    }

    // Copy properties from standardized tool
    super({
      name: standardizedTool.name,
      description: standardizedTool.description,
      schema: standardizedTool.schema,
      func: standardizedTool.func
    });

    this.queryService = new QueryService();
  }

  /**
   * Static method for executing query logic (used by standardized interface)
   */
  private static async executeQuery(args: any): Promise<string> {
    const queryService = new QueryService();
    return await QueryTradesTool.executeQueryInternal(queryService, args);
  }

  private static async executeQueryInternal(queryService: QueryService, args: any): Promise<string> {
    const { commodity, date_from, date_to, metric } = args;
    
    logger.info("📊 QueryTradesTool executing REAL query with:", { commodity, date_from, date_to, metric });

    try {
      switch (metric) {
        case 'positions':
          const positions = await queryService.getPositions({ commodity, date_from, date_to });
          return QueryTradesTool.formatPositions(positions);
        
        case 'pnl':
          const pnl = await queryService.getPnLSummary({ commodity, date_from, date_to });
          return QueryTradesTool.formatPnL(pnl);
        
        case 'exposure':
          const exposure = await queryService.getExposure({ commodity });
          return QueryTradesTool.formatExposure(exposure);
        
        case 'trades':
          const trades = await queryService.getRecentTrades({ commodity, limit: 20 });
          return QueryTradesTool.formatTrades(trades);
        
        default:
          return 'Invalid metric type specified.';
      }
    } catch (error) {
      logger.error("❌ QueryTradesTool error:", error);
      return `Error querying trades: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private static formatPositions(positions: any[]): string {
    if (!positions || positions.length === 0) {
      return '📊 No positions found for the specified criteria.';
    }

    // Define table columns
    const columns: TableColumn[] = [
      {
        key: 'commodity',
        header: 'Commodity',
        align: 'left',
        formatter: (value) => ResponseFormatter.formatCommodity(value)
      },
      {
        key: 'quantity',
        header: 'Position',
        align: 'right',
        formatter: (value) => ResponseFormatter.formatNumber(value)
      },
      {
        key: 'unit',
        header: 'Unit',
        align: 'center'
      },
      {
        key: 'avg_price',
        header: 'Avg Price',
        align: 'right',
        formatter: (value) => ResponseFormatter.formatCurrency(value)
      },
      {
        key: 'market_value',
        header: 'Market Value',
        align: 'right',
        formatter: (value) => ResponseFormatter.formatCurrency(value)
      },
      {
        key: 'unrealized_pnl',
        header: 'Unrealized P&L',
        align: 'right',
        formatter: (value) => ResponseFormatter.formatPnL(value)
      },
      {
        key: 'total_pnl',
        header: 'Total P&L',
        align: 'right',
        formatter: (value) => ResponseFormatter.formatPnL(value)
      }
    ];

    // Calculate totals
    const totals = positions.reduce((acc, pos) => ({
      market_value: acc.market_value + (pos.market_value || 0),
      unrealized_pnl: acc.unrealized_pnl + (pos.unrealized_pnl || 0),
      total_pnl: acc.total_pnl + (pos.total_pnl || 0)
    }), { market_value: 0, unrealized_pnl: 0, total_pnl: 0 });

    // Build the table
    const table = MarkdownTableBuilder.buildTable(
      positions,
      columns,
      {
        summaryRow: {
          commodity: 'TOTAL',
          market_value: totals.market_value,
          unrealized_pnl: totals.unrealized_pnl,
          total_pnl: totals.total_pnl
        }
      }
    );

    // Calculate additional metrics
    const winningPositions = positions.filter(p => p.total_pnl > 0).length;
    const winRate = positions.length > 0 ? (winningPositions / positions.length * 100) : 0;

    return `## 📊 Trading Positions Summary

${table}

### Key Metrics
${MarkdownTableBuilder.buildInlineTable({
  'Total Positions': positions.length,
  'Winning Positions': winningPositions,
  'Win Rate': ResponseFormatter.formatPercentage(winRate),
  'Total Exposure': ResponseFormatter.formatCurrency(Math.abs(totals.market_value))
})}

${ResponseFormatter.createDivider()}
${ResponseFormatter.createTimestamp()}`;
  }

  private static formatPnL(pnl: any): string {
    // Build P&L metrics table
    const pnlData = {
      'Total P&L': ResponseFormatter.formatPnL(pnl.total_pnl || 0),
      'Realized P&L': ResponseFormatter.formatCurrency(pnl.realized_pnl || 0, true),
      'Unrealized P&L': ResponseFormatter.formatCurrency(pnl.unrealized_pnl || 0, true),
      'Win Rate': ResponseFormatter.formatPercentage(pnl.win_rate || 0),
      'Best Trade': ResponseFormatter.formatCurrency(pnl.best_trade || 0, true),
      'Worst Trade': ResponseFormatter.formatCurrency(pnl.worst_trade || 0, true),
      'Active Positions': pnl.product_count || 0
    };

    const metricsTable = MarkdownTableBuilder.buildKeyValueTable(
      pnlData,
      'Metric',
      'Value'
    );

    // Determine overall performance status
    const totalPnl = pnl.total_pnl || 0;
    const performanceStatus = totalPnl > 0 ? '🟢 Profitable' : totalPnl < 0 ? '🔴 Loss' : '⚪ Break Even';

    return `## 💰 P&L Performance Summary

### Overall Status: ${performanceStatus}

${metricsTable}

### Performance Analysis
${MarkdownTableBuilder.buildInlineTable({
  'Trading Edge': pnl.win_rate > 50 ? '✅ Positive' : '❌ Negative',
  'Risk/Reward': pnl.best_trade && pnl.worst_trade ? 
    `${Math.abs(pnl.best_trade / pnl.worst_trade).toFixed(2)}:1` : 'N/A',
  'Profitability': totalPnl > 0 ? '📈 Gaining' : totalPnl < 0 ? '📉 Losing' : '➡️ Flat'
})}

${ResponseFormatter.createDivider()}
${ResponseFormatter.createTimestamp()}`;
  }

  private static formatExposure(exposure: any[]): string {
    if (!exposure || exposure.length === 0) {
      return '📊 No exposure data found.';
    }

    // Calculate total exposure
    const totalExposure = exposure.reduce((sum, e) => sum + Math.abs(e.net_exposure || 0), 0);

    // Define table columns
    const columns: TableColumn[] = [
      {
        key: 'commodity',
        header: 'Commodity',
        align: 'left',
        formatter: (value) => ResponseFormatter.formatCommodity(value)
      },
      {
        key: 'long_exposure',
        header: 'Long Exposure',
        align: 'right',
        formatter: (value) => ResponseFormatter.formatCurrency(value)
      },
      {
        key: 'short_exposure',
        header: 'Short Exposure',
        align: 'right',
        formatter: (value) => ResponseFormatter.formatCurrency(value)
      },
      {
        key: 'net_exposure',
        header: 'Net Exposure',
        align: 'right',
        formatter: (value) => ResponseFormatter.formatPnL(value)
      },
      {
        key: 'percentage',
        header: '% of Total',
        align: 'right',
        formatter: (value, row) => {
          const percentage = (Math.abs(row.net_exposure) / totalExposure * 100);
          return ResponseFormatter.formatPercentage(percentage);
        }
      }
    ];

    // Add percentage to data
    const enrichedData = exposure.map(e => ({
      ...e,
      percentage: (Math.abs(e.net_exposure) / totalExposure * 100)
    }));

    // Build the table
    const table = MarkdownTableBuilder.buildTable(
      enrichedData,
      columns
    );

    // Determine concentration risk
    const maxExposure = Math.max(...exposure.map(e => Math.abs(e.net_exposure)));
    const maxExposurePercent = (maxExposure / totalExposure * 100);
    const concentrationRisk = maxExposurePercent > 50 ? 'high' : 
                            maxExposurePercent > 30 ? 'moderate' : 'low';

    return `## 🎯 Risk Exposure Analysis

${table}

### Summary Metrics
${MarkdownTableBuilder.buildInlineTable({
  'Total Gross Exposure': ResponseFormatter.formatCurrency(totalExposure),
  'Number of Positions': exposure.length,
  'Concentration Risk': ResponseFormatter.getRiskIndicator(concentrationRisk),
  'Largest Exposure': `${ResponseFormatter.formatPercentage(maxExposurePercent)} of total`
})}

### Risk Assessment
${QueryTradesTool.generateRiskAssessment(exposure, totalExposure)}

${ResponseFormatter.createDivider()}
${ResponseFormatter.createTimestamp()}`;
  }

  private static generateRiskAssessment(exposure: any[], totalExposure: number): string {
    const netLong = exposure.reduce((sum, e) => sum + (e.long_exposure || 0), 0);
    const netShort = exposure.reduce((sum, e) => sum + Math.abs(e.short_exposure || 0), 0);
    const directionalBias = netLong > netShort ? 'Long' : netLong < netShort ? 'Short' : 'Neutral';
    
    return MarkdownTableBuilder.buildInlineTable({
      'Directional Bias': `${directionalBias} ${ResponseFormatter.getDirectionalArrow(netLong - netShort)}`,
      'Long/Short Ratio': `${(netLong / (netShort || 1)).toFixed(2)}:1`,
      'Diversification': exposure.length >= 5 ? '✅ Well Diversified' : exposure.length >= 3 ? '⚠️ Moderate' : '❌ Concentrated'
    });
  }

  private static formatTrades(trades: any[]): string {
    if (!trades || trades.length === 0) {
      return '📊 No recent trades found.';
    }

    // Take top 10 trades
    const recentTrades = trades.slice(0, 10);

    // Define table columns
    const columns: TableColumn[] = [
      {
        key: 'trade_date',
        header: 'Date',
        align: 'left',
        formatter: (value) => ResponseFormatter.formatDate(value)
      },
      {
        key: 'commodity',
        header: 'Commodity',
        align: 'left',
        formatter: (value) => ResponseFormatter.formatCommodity(value)
      },
      {
        key: 'side',
        header: 'Side',
        align: 'center',
        formatter: (value) => value === 'BUY' ? '🟢 BUY' : '🔴 SELL'
      },
      {
        key: 'quantity',
        header: 'Quantity',
        align: 'right',
        formatter: (value) => ResponseFormatter.formatNumber(value)
      },
      {
        key: 'price',
        header: 'Price',
        align: 'right',
        formatter: (value) => ResponseFormatter.formatCurrency(value)
      },
      {
        key: 'total_value',
        header: 'Total Value',
        align: 'right',
        formatter: (value) => ResponseFormatter.formatCurrency(value)
      },
      {
        key: 'counterparty',
        header: 'Counterparty',
        align: 'left'
      }
    ];

    // Build the table
    const table = MarkdownTableBuilder.buildTable(
      recentTrades,
      columns
    );

    // Calculate summary statistics
    const totalVolume = trades.reduce((sum, t) => sum + Math.abs(t.total_value || 0), 0);
    const buyCount = trades.filter(t => t.side === 'BUY').length;
    const sellCount = trades.filter(t => t.side === 'SELL').length;

    return `## 📈 Recent Trading Activity

${table}

### Trading Statistics (Last ${trades.length} Trades)
${MarkdownTableBuilder.buildInlineTable({
  'Total Volume': ResponseFormatter.formatCurrency(totalVolume),
  'Buy Orders': `${buyCount} (${ResponseFormatter.formatPercentage(buyCount / trades.length * 100)})`,
  'Sell Orders': `${sellCount} (${ResponseFormatter.formatPercentage(sellCount / trades.length * 100)})`,
  'Trading Activity': trades.length >= 20 ? '🔥 High' : trades.length >= 10 ? '⚡ Moderate' : '🐌 Low'
})}

${ResponseFormatter.createDivider()}
${ResponseFormatter.createTimestamp()}`;
  }
}
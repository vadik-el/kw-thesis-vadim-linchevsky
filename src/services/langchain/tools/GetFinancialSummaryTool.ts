import { DynamicTool } from "@langchain/core/tools";
import { z } from "zod";
import { QueryService } from '../../queryService';
import { logger } from '../../../utils/logger';
import { ResponseFormatter } from '../../../utils/responseFormatter';
import { MarkdownTableBuilder, TableColumn } from '../../../utils/markdownTableBuilder';

const GetFinancialSummarySchema = z.object({
  report_type: z.enum(['ar_summary', 'ap_summary', 'cash_flow', 'counterparty']).describe("Type of financial report"),
  counterparty_name: z.string().optional().describe("Required when report_type is counterparty")
});

export class GetFinancialSummaryTool extends DynamicTool {
  private queryService: QueryService;

  constructor() {
    super({
      name: "get_financial_summary",
      description: "Get AR/AP summary, cash flow analysis, or counterparty information. Returns REAL financial data from the system.",
      schema: GetFinancialSummarySchema,
      func: async (input) => {
        return await this.getFinancialSummary(input);
      }
    });

    this.queryService = new QueryService();
  }

  private async getFinancialSummary(args: any): Promise<string> {
    const { report_type, counterparty_name } = args;

    logger.info("💰 GetFinancialSummaryTool executing REAL financial query with:", { report_type, counterparty_name });

    try {
      switch (report_type) {
        case 'ar_summary':
          const arData = await this.queryService.getARSummary();
          return this.formatARSummary(arData);
        
        case 'ap_summary':
          const apData = await this.queryService.getAPSummary();
          return this.formatAPSummary(apData);
        
        case 'cash_flow':
          const cashFlowData = await this.queryService.getCashFlow();
          return this.formatCashFlow(cashFlowData);
        
        case 'counterparty':
          if (!counterparty_name) {
            return 'Counterparty name is required for this report type.';
          }
          const counterpartyData = await this.queryService.getCounterpartyDetails(counterparty_name);
          return this.formatCounterparty(counterpartyData);
        
        default:
          return 'Invalid report type specified.';
      }
    } catch (error) {
      logger.error("❌ GetFinancialSummaryTool error:", error);
      return `Error retrieving financial summary: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private formatARSummary(ar: any): string {
    // Build aging table
    const agingData = [
      { period: 'Current (0-30 days)', amount: ar.current || 0, percentage: 0 },
      { period: '31-60 days', amount: ar.days_31_60 || 0, percentage: 0 },
      { period: '61-90 days', amount: ar.days_61_90 || 0, percentage: 0 },
      { period: 'Over 90 days', amount: ar.over_90 || 0, percentage: 0 }
    ];

    // Calculate percentages
    const total = parseFloat(ar.total_outstanding) || agingData.reduce((sum, item) => sum + item.amount, 0);
    agingData.forEach(item => {
      item.percentage = total > 0 ? (item.amount / total * 100) : 0;
    });

    const columns: TableColumn[] = [
      { key: 'period', header: 'Aging Period', align: 'left' },
      { 
        key: 'amount', 
        header: 'Amount', 
        align: 'right',
        formatter: (value) => ResponseFormatter.formatCurrency(value)
      },
      { 
        key: 'percentage', 
        header: '% of Total', 
        align: 'right',
        formatter: (value) => ResponseFormatter.formatPercentage(value)
      }
    ];

    const agingTable = MarkdownTableBuilder.buildTable(agingData, columns);

    // Build summary metrics
    const metricsTable = MarkdownTableBuilder.buildKeyValueTable({
      'Total Outstanding': ResponseFormatter.formatCurrency(ar.total_outstanding || total),
      'Average Days Outstanding': `${ar.avg_days_outstanding || 0} days`,
      'Collection Rate': ResponseFormatter.formatPercentage(ar.collection_rate || 0),
      'Collection Health': ar.collection_rate >= 90 ? '🟢 Excellent' : 
                          ar.collection_rate >= 80 ? '🟡 Good' : 
                          ar.collection_rate >= 70 ? '🟠 Fair' : '🔴 Poor'
    });

    return `## 💸 Accounts Receivable Summary

### Aging Analysis
${agingTable}

### Collection Metrics
${metricsTable}

### Collection Performance
${ResponseFormatter.createProgressBar(ar.collection_rate || 0)}

${ResponseFormatter.createDivider()}
${ResponseFormatter.createTimestamp()}`;
  }

  private formatAPSummary(ap: any): string {
    // Build aging table
    const agingData = [
      { period: 'Current (0-30 days)', amount: ap.current || 0, percentage: 0 },
      { period: '31-60 days', amount: ap.days_31_60 || 0, percentage: 0 },
      { period: '61-90 days', amount: ap.days_61_90 || 0, percentage: 0 },
      { period: 'Over 90 days', amount: ap.over_90 || 0, percentage: 0 }
    ];

    // Calculate percentages
    const total = parseFloat(ap.total_outstanding) || agingData.reduce((sum, item) => sum + item.amount, 0);
    agingData.forEach(item => {
      item.percentage = total > 0 ? (item.amount / total * 100) : 0;
    });

    const columns: TableColumn[] = [
      { key: 'period', header: 'Aging Period', align: 'left' },
      { 
        key: 'amount', 
        header: 'Amount', 
        align: 'right',
        formatter: (value) => ResponseFormatter.formatCurrency(value)
      },
      { 
        key: 'percentage', 
        header: '% of Total', 
        align: 'right',
        formatter: (value) => ResponseFormatter.formatPercentage(value)
      }
    ];

    const agingTable = MarkdownTableBuilder.buildTable(agingData, columns);

    // Build payment metrics
    const metricsTable = MarkdownTableBuilder.buildKeyValueTable({
      'Total Outstanding': ResponseFormatter.formatCurrency(ap.total_outstanding || total),
      'Average Payment Terms': `${ap.avg_payment_terms || 30} days`,
      'On-Time Payment Rate': ResponseFormatter.formatPercentage(ap.on_time_rate || 0),
      'Payment Performance': ap.on_time_rate >= 95 ? '🟢 Excellent' : 
                            ap.on_time_rate >= 90 ? '🟡 Good' : 
                            ap.on_time_rate >= 80 ? '🟠 Fair' : '🔴 Needs Improvement'
    });

    return `## 💳 Accounts Payable Summary

### Aging Analysis
${agingTable}

### Payment Metrics
${metricsTable}

### Payment Performance
${ResponseFormatter.createProgressBar(ap.on_time_rate || 0)}

${ResponseFormatter.createDivider()}
${ResponseFormatter.createTimestamp()}`;
  }

  private formatCashFlow(cf: any): string {
    // Parse values to handle both number and string formats
    const parseValue = (value: any): number => {
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        return parseFloat(value.replace(/[$,]/g, '')) || 0;
      }
      return 0;
    };

    const operating = parseValue(cf.operating_cash_flow);
    const investing = parseValue(cf.investing_cash_flow);
    const financing = parseValue(cf.financing_cash_flow);
    const netFlow = parseValue(cf.net_cash_flow);

    // Build cash flow components table
    const flowData = [
      { 
        component: 'Operating Activities', 
        amount: operating,
        indicator: operating > 0 ? '🟢' : '🔴'
      },
      { 
        component: 'Investing Activities', 
        amount: investing,
        indicator: investing < 0 ? '⚪' : investing > 0 ? '🟢' : '⚪'
      },
      { 
        component: 'Financing Activities', 
        amount: financing,
        indicator: financing < 0 ? '⚪' : financing > 0 ? '🟢' : '⚪'
      }
    ];

    const columns: TableColumn[] = [
      { key: 'component', header: 'Cash Flow Component', align: 'left' },
      { 
        key: 'amount', 
        header: 'Amount', 
        align: 'right',
        formatter: (value) => ResponseFormatter.formatPnL(value)
      },
      { key: 'indicator', header: 'Status', align: 'center' }
    ];

    const flowTable = MarkdownTableBuilder.buildTable(
      flowData,
      columns,
      {
        summaryRow: {
          component: 'NET CASH FLOW',
          amount: netFlow,
          indicator: netFlow > 0 ? '📈' : netFlow < 0 ? '📉' : '➡️'
        }
      }
    );

    // Build liquidity metrics
    const liquidityTable = MarkdownTableBuilder.buildKeyValueTable({
      'Cash Balance': ResponseFormatter.formatCurrency(cf.cash_balance || 0),
      'Available Credit': ResponseFormatter.formatCurrency(cf.available_credit || 0),
      'Total Liquidity': ResponseFormatter.formatCurrency(
        parseValue(cf.cash_balance) + parseValue(cf.available_credit)
      ),
      'Liquidity Ratio': cf.liquidity_ratio ? `${cf.liquidity_ratio}x` : 'N/A',
      'Liquidity Health': cf.liquidity_ratio >= 2 ? '🟢 Strong' :
                         cf.liquidity_ratio >= 1 ? '🟡 Adequate' : '🔴 Weak'
    });

    return `## 💵 Cash Flow Analysis

### Cash Flow Statement
${flowTable}

### Liquidity Position
${liquidityTable}

### Cash Flow Trend
${netFlow > 0 ? '📈 **Positive cash generation** - Building cash reserves' :
  netFlow < 0 ? '📉 **Cash consumption** - Monitor burn rate carefully' :
  '➡️ **Neutral cash flow** - Operating at breakeven'}

${ResponseFormatter.createDivider()}
${ResponseFormatter.createTimestamp()}`;
  }

  private formatCounterparty(cp: any): string {
    // Build credit metrics table
    const creditTable = MarkdownTableBuilder.buildKeyValueTable({
      'Credit Rating': `${cp.credit_rating} ${this.getRatingIndicator(cp.credit_rating)}`,
      'Credit Limit': ResponseFormatter.formatCurrency(cp.credit_limit || 0),
      'Current Exposure': ResponseFormatter.formatCurrency(cp.current_exposure || 0),
      'Available Credit': ResponseFormatter.formatCurrency(cp.available_credit || 0),
      'Utilization': ResponseFormatter.formatPercentage(
        cp.credit_limit > 0 ? (cp.current_exposure / cp.credit_limit * 100) : 0
      )
    });

    // Build position table
    const positionTable = MarkdownTableBuilder.buildKeyValueTable({
      'Outstanding Receivables': ResponseFormatter.formatCurrency(cp.receivables || 0),
      'Outstanding Payables': ResponseFormatter.formatCurrency(cp.payables || 0),
      'Net Position': ResponseFormatter.formatPnL(cp.net_position || 0),
      'Position Status': cp.net_position > 0 ? '📈 Net Creditor' : 
                        cp.net_position < 0 ? '📉 Net Debtor' : '⚖️ Balanced'
    });

    // Build payment behavior table
    const behaviorTable = MarkdownTableBuilder.buildKeyValueTable({
      'Payment History': `${cp.payment_history} ${this.getPaymentIndicator(cp.payment_history)}`,
      'Average Days to Pay': `${cp.avg_days_to_pay || 0} days`,
      'Payment Behavior': cp.avg_days_to_pay <= 30 ? '🟢 Prompt Payer' :
                         cp.avg_days_to_pay <= 45 ? '🟡 Normal' :
                         cp.avg_days_to_pay <= 60 ? '🟠 Slow' : '🔴 Very Slow'
    });

    // Calculate credit utilization for visual meter
    const utilization = cp.credit_limit > 0 ? 
      (cp.current_exposure / cp.credit_limit * 100) : 0;

    return `## 🤝 Counterparty Profile: ${cp.name}

### Credit Analysis
${creditTable}

### Credit Utilization
${ResponseFormatter.createProgressBar(utilization)}

### Trading Position
${positionTable}

### Payment Behavior
${behaviorTable}

### Risk Assessment
${this.generateCounterpartyRiskAssessment(cp)}

${ResponseFormatter.createDivider()}
${ResponseFormatter.createTimestamp()}`;
  }

  private getRatingIndicator(rating: string): string {
    if (!rating) return '';
    
    if (rating.match(/AAA?/)) return '🟢';
    if (rating.match(/BBB?/)) return '🟡';
    if (rating.match(/CCC?/)) return '🟠';
    return '🔴';
  }

  private getPaymentIndicator(history: string): string {
    if (!history) return '';
    
    const lowerHistory = history.toLowerCase();
    if (lowerHistory.includes('excellent') || lowerHistory.includes('good')) return '✅';
    if (lowerHistory.includes('fair')) return '⚠️';
    if (lowerHistory.includes('poor')) return '❌';
    return '';
  }

  private generateCounterpartyRiskAssessment(cp: any): string {
    // Calculate overall risk score
    let riskScore = 0;
    let riskFactors = [];

    // Credit rating risk
    if (cp.credit_rating && cp.credit_rating.match(/[CD]/)) {
      riskScore += 3;
      riskFactors.push('Low credit rating');
    }

    // Utilization risk
    const utilization = cp.credit_limit > 0 ? 
      (cp.current_exposure / cp.credit_limit * 100) : 0;
    if (utilization > 80) {
      riskScore += 2;
      riskFactors.push('High credit utilization');
    }

    // Payment behavior risk
    if (cp.avg_days_to_pay > 60) {
      riskScore += 2;
      riskFactors.push('Slow payment history');
    }

    // Determine overall risk level
    const riskLevel = riskScore >= 5 ? 'high' : 
                     riskScore >= 3 ? 'moderate' : 'low';

    return MarkdownTableBuilder.buildInlineTable({
      'Overall Risk Level': ResponseFormatter.getRiskIndicator(riskLevel),
      'Key Risk Factors': riskFactors.length > 0 ? riskFactors.join(', ') : 'None identified',
      'Recommendation': riskLevel === 'high' ? '⚠️ Monitor closely' :
                       riskLevel === 'moderate' ? '👀 Regular review' : '✅ Continue normal terms'
    });
  }
}
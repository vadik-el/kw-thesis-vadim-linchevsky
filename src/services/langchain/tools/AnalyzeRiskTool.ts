import { DynamicTool } from "@langchain/core/tools";
import { z } from "zod";
import { QueryService } from '../../queryService';
import { logger } from '../../../utils/logger';
import { ResponseFormatter } from '../../../utils/responseFormatter';
import { MarkdownTableBuilder, TableColumn } from '../../../utils/markdownTableBuilder';

const AnalyzeRiskSchema = z.object({
  analysis_type: z.enum(['var', 'exposure', 'margin', 'stress_test']).describe("Type of risk analysis"),
  commodity: z.string().optional().describe("Optional commodity filter"),
  confidence_level: z.number().default(0.95).describe("Confidence level for VaR (e.g., 0.95)")
});

export class AnalyzeRiskTool extends DynamicTool {
  private queryService: QueryService;

  constructor() {
    super({
      name: "analyze_risk",
      description: "Calculate risk metrics including VaR, exposure, and margin requirements. Returns REAL risk calculations from the system.",
      schema: AnalyzeRiskSchema,
      func: async (input) => {
        return await this.analyzeRisk(input);
      }
    });

    this.queryService = new QueryService();
  }

  private async analyzeRisk(args: any): Promise<string> {
    const { analysis_type, commodity, confidence_level = 0.95 } = args;

    logger.info("🛡️ AnalyzeRiskTool executing REAL risk analysis with:", { analysis_type, commodity, confidence_level });

    try {
      switch (analysis_type) {
        case 'var':
          const varData = await this.queryService.calculateVaR({ commodity, confidence_level });
          return this.formatVaR(varData);
        
        case 'exposure':
          const exposureData = await this.queryService.getExposure({ commodity });
          return this.formatRiskExposure(exposureData);
        
        case 'margin':
          const marginData = await this.queryService.getMarginRequirements({ commodity });
          return this.formatMarginRequirements(marginData);
        
        case 'stress_test':
          const stressData = await this.queryService.runStressTest({ commodity });
          return this.formatStressTest(stressData);
        
        default:
          return 'Invalid analysis type specified.';
      }
    } catch (error) {
      logger.error("❌ AnalyzeRiskTool error:", error);
      return `Error analyzing risk: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private formatVaR(varData: any): string {
    // Build VaR metrics table
    const varMetrics = {
      'Confidence Level': ResponseFormatter.formatPercentage(varData.confidence_level * 100),
      'Portfolio Value': ResponseFormatter.formatCurrency(varData.portfolio_value || 0),
      'Historical Volatility': ResponseFormatter.formatPercentage(varData.volatility || 0),
      '1-Day VaR': ResponseFormatter.formatCurrency(varData.var_1day || 0),
      '5-Day VaR': ResponseFormatter.formatCurrency(varData.var_5day || 0),
      '20-Day VaR': ResponseFormatter.formatCurrency(varData.var_20day || 0)
    };

    const metricsTable = MarkdownTableBuilder.buildKeyValueTable(
      varMetrics,
      'Risk Metric',
      'Value'
    );

    // Calculate risk levels
    const portfolioValue = varData.portfolio_value || 1;
    const var1DayPercent = (varData.var_1day / portfolioValue) * 100;
    const riskLevel = var1DayPercent > 5 ? 'high' : var1DayPercent > 3 ? 'moderate' : 'low';

    return `## 📊 Value at Risk (VaR) Analysis

### Risk Metrics at ${ResponseFormatter.formatPercentage(varData.confidence_level * 100)} Confidence

${metricsTable}

### Risk Assessment
${MarkdownTableBuilder.buildInlineTable({
  'Daily Risk Level': ResponseFormatter.getRiskIndicator(riskLevel),
  'Risk as % of Portfolio': ResponseFormatter.formatPercentage(var1DayPercent),
  'Maximum Expected Loss (20d)': ResponseFormatter.formatCurrency(varData.var_20day)
})}

### Interpretation
- **1-Day VaR**: With ${ResponseFormatter.formatPercentage(varData.confidence_level * 100)} confidence, the portfolio will not lose more than ${ResponseFormatter.formatCurrency(varData.var_1day)} in a single day
- **Risk Horizon**: Longer timeframes show ${ResponseFormatter.getDirectionalArrow(varData.var_20day - varData.var_1day)} increasing risk due to time decay

${ResponseFormatter.createDivider()}
${ResponseFormatter.createTimestamp()}`;
  }

  private formatRiskExposure(exposure: any[]): string {
    // This is already handled by QueryTradesTool.formatExposure()
    // But we'll provide a risk-focused view here
    if (!exposure || exposure.length === 0) {
      return '📊 No exposure data available for risk analysis.';
    }

    const total = exposure.reduce((sum, e) => sum + Math.abs(e.net_exposure || 0), 0);

    // Create risk-focused exposure table
    const columns: TableColumn[] = [
      {
        key: 'commodity',
        header: 'Commodity',
        align: 'left',
        formatter: (value) => ResponseFormatter.formatCommodity(value)
      },
      {
        key: 'net_exposure',
        header: 'Net Exposure',
        align: 'right',
        formatter: (value) => ResponseFormatter.formatCurrency(value)
      },
      {
        key: 'risk_weight',
        header: 'Risk Weight',
        align: 'right',
        formatter: (value, row) => {
          const percentage = (Math.abs(row.net_exposure) / total * 100);
          return ResponseFormatter.formatPercentage(percentage);
        }
      },
      {
        key: 'risk_contribution',
        header: 'Risk Score',
        align: 'center',
        formatter: (value, row) => {
          const percentage = (Math.abs(row.net_exposure) / total * 100);
          if (percentage > 40) return '🔴 High';
          if (percentage > 25) return '🟡 Medium';
          return '🟢 Low';
        }
      }
    ];

    const table = MarkdownTableBuilder.buildTable(exposure, columns);

    // Calculate concentration metrics
    const hhi = exposure.reduce((sum, e) => {
      const share = Math.abs(e.net_exposure) / total;
      return sum + (share * share);
    }, 0) * 10000; // HHI in basis points

    return `## 🎯 Risk Exposure Concentration Analysis

${table}

### Concentration Metrics
${MarkdownTableBuilder.buildInlineTable({
  'Total Exposure': ResponseFormatter.formatCurrency(total),
  'Herfindahl Index': `${hhi.toFixed(0)} (${hhi > 2500 ? '🔴 High Concentration' : hhi > 1500 ? '🟡 Moderate' : '🟢 Well Diversified'})`,
  'Largest Position': `${ResponseFormatter.formatPercentage(Math.max(...exposure.map(e => Math.abs(e.net_exposure) / total * 100)))}`,
  'Portfolio Direction': exposure.reduce((sum, e) => sum + e.net_exposure, 0) > 0 ? '📈 Net Long' : '📉 Net Short'
})}

${ResponseFormatter.createDivider()}
${ResponseFormatter.createTimestamp()}`;
  }

  private formatMarginRequirements(margin: any): string {
    // Build margin table
    const marginData = {
      'Initial Margin': ResponseFormatter.formatCurrency(margin.initial_margin || 0),
      'Variation Margin': ResponseFormatter.formatCurrency(margin.variation_margin || 0),
      'Total Required': ResponseFormatter.formatCurrency(margin.total_required || 0),
      'Current Posted': ResponseFormatter.formatCurrency(margin.current_posted || 0),
      'Excess/Deficit': ResponseFormatter.formatPnL(margin.excess_deficit || 0)
    };

    const marginTable = MarkdownTableBuilder.buildKeyValueTable(
      marginData,
      'Margin Component',
      'Amount'
    );

    // Create utilization meter
    const utilization = margin.utilization || 0;
    const utilizationMeter = ResponseFormatter.createVisualMeter(
      utilization,
      { warning: 75, critical: 90 }
    );

    return `## 💰 Margin Requirements Analysis

### Current Margin Status
${marginTable}

### Utilization Metrics
${MarkdownTableBuilder.buildInlineTable({
  'Margin Utilization': utilizationMeter,
  'Available Buffer': ResponseFormatter.formatCurrency(Math.max(0, margin.excess_deficit || 0)),
  'Status': margin.excess_deficit > 0 ? '✅ Adequate' : '❌ Margin Call',
  'Coverage Ratio': `${((margin.current_posted / margin.total_required) * 100).toFixed(1)}%`
})}

### Visual Utilization
${ResponseFormatter.createProgressBar(utilization)}

${ResponseFormatter.createDivider()}
${ResponseFormatter.createTimestamp()}`;
  }

  private formatStressTest(stress: any): string {
    // Build stress test scenarios table
    const columns: TableColumn[] = [
      {
        key: 'name',
        header: 'Scenario',
        align: 'left'
      },
      {
        key: 'impact',
        header: 'Impact',
        align: 'right',
        formatter: (value) => ResponseFormatter.formatPnL(value)
      },
      {
        key: 'probability',
        header: 'Probability',
        align: 'right',
        formatter: (value) => ResponseFormatter.formatPercentage(value)
      },
      {
        key: 'severity',
        header: 'Severity',
        align: 'center',
        formatter: (value, row) => {
          const impactPercent = Math.abs(row.impact / stress.base_value * 100);
          if (impactPercent > 30) return '🔴 Severe';
          if (impactPercent > 15) return '🟠 High';
          if (impactPercent > 5) return '🟡 Moderate';
          return '🟢 Low';
        }
      }
    ];

    const scenarioTable = MarkdownTableBuilder.buildTable(
      stress.scenarios,
      columns
    );

    // Build summary metrics
    const summaryMetrics = {
      'Base Portfolio Value': ResponseFormatter.formatCurrency(stress.base_value || 0),
      '95% VaR': ResponseFormatter.formatCurrency(stress.var_95 || 0),
      '99% VaR': ResponseFormatter.formatCurrency(stress.var_99 || 0),
      'Worst Case Impact': ResponseFormatter.formatCurrency(
        Math.min(...stress.scenarios.map((s: any) => s.impact))
      )
    };

    return `## 🔥 Stress Test Analysis

### Scenario Analysis
${scenarioTable}

### Portfolio Resilience Metrics
${MarkdownTableBuilder.buildKeyValueTable(summaryMetrics, 'Metric', 'Value')}

### Risk Summary
${MarkdownTableBuilder.buildInlineTable({
  'Expected Loss (Weighted)': ResponseFormatter.formatCurrency(
    stress.scenarios.reduce((sum: number, s: any) => 
      sum + (s.impact * s.probability / 100), 0
    )
  ),
  'Tail Risk Exposure': `${((stress.var_99 / stress.base_value) * 100).toFixed(1)}% of portfolio`,
  'Stress Test Result': Math.abs(stress.var_99) < stress.base_value * 0.4 ? 
    '✅ Portfolio Resilient' : '⚠️ High Vulnerability'
})}

${ResponseFormatter.createDivider()}
${ResponseFormatter.createTimestamp()}`;
  }
}
# Tools Documentation

This document provides comprehensive information about all tools available in the LangChain Vessel Tracking Agent system.

## Tool Architecture Overview

The system implements tools using LangChain's `DynamicTool` pattern, which provides:

- **Structured Input Validation**: Using Zod schemas for type safety
- **Automatic Tool Selection**: Agent selects tools based on descriptions and context
- **Error Handling**: Graceful degradation when tools fail
- **Result Formatting**: Consistent response formatting for agent consumption

```typescript
// Basic tool structure
class ExampleTool extends DynamicTool {
  constructor() {
    super({
      name: "tool_name",
      description: "What this tool does - used by agent for selection",
      schema: ZodSchema, // Input validation
      func: async (input) => await this.executeFunction(input)
    });
  }
}
```

## Available Tools

### 1. TrackVesselTool

**Purpose**: Real-time vessel tracking using Bill of Lading numbers via Terminal49 API.

**File**: `src/services/langchain/tools/TrackVesselTool.ts`

#### Schema

```typescript
const TrackVesselSchema = z.object({
  bl_number: z.string().describe("Bill of Lading number")
});
```

#### Usage Examples

```typescript
// Automatic selection by agent
"Track vessel for B/L MSKU123456789"
"What's the status of shipment BL-2024-001?"
"Find vessel carrying B/L COSCO456789"

// Direct tool usage
const tool = new TrackVesselTool();
const result = await tool.func({ bl_number: "MSKU123456789" });
```

#### Response Format

```markdown
🚢 **Vessel Tracking for B/L: MSKU123456789**

**Vessel:** MSC OSCAR
**Carrier:** Mediterranean Shipping Company
**Status:** In Transit

**Route:**
- **Origin:** Shanghai, China
- **Destination:** Long Beach, CA
- **Current Location:** Pacific Ocean
- **ETA:** March 15, 2024

**Containers:** 12
**Last Update:** March 10, 2024, 14:30 UTC
```

#### Error Handling

- Invalid B/L format: Returns format guidance
- API failures: Graceful error message with retry suggestions
- No data found: Clear message with alternative suggestions
- Rate limits: Exponential backoff with user notification

#### Configuration

```typescript
// Terminal49 service configuration
const config = {
  apiKey: process.env.TERMINAL49_API_KEY,
  baseUrl: 'https://api.terminal49.com/v2',
  timeout: 10000,
  retryAttempts: 3,
  rateLimitDelay: 1000
};
```

#### Limitations

**Current Terminal49 Standard Tier provides:**
- ✅ Vessel names and IMO numbers
- ✅ Carrier information
- ✅ Port names (loading/discharge)
- ✅ Shipment status updates
- ✅ Container numbers
- ✅ Event timestamps

**Premium Tier required for:**
- ❌ Real-time coordinates
- ❌ Map visualization
- ❌ Route predictions

### 2. DocumentSearchTool

**Purpose**: Semantic search across shipping documents using vector embeddings.

**File**: `src/services/langchain/tools/DocumentSearchTool.ts`

#### Schema

```typescript
const DocumentSearchSchema = z.object({
  query: z.string().describe("Search query text"),
  document_type: z.enum(['bill_of_lading', 'contract', 'invoice', 'warehouse_release', 'certificate', 'all'])
    .default('all').describe("Type of document to search for"),
  category: z.enum(['Administrative', 'Financial', 'Legal', 'Operational', 'all'])
    .default('all').describe("Document category"),
  limit: z.number().default(10).describe("Maximum number of results")
});
```

#### Usage Examples

```typescript
// Natural language queries
"Find all bills of lading from Shanghai last month"
"Search for contracts mentioning copper"
"Show me invoices over $100K from Q3"
"Find documents related to vessel MSC OSCAR"

// Specific searches
{
  query: "copper shipment",
  document_type: "bill_of_lading",
  category: "Operational",
  limit: 5
}
```

#### Response Format

```markdown
📋 **Document Search Results** (5 documents found)

**1. Bill of Lading - BL-2024-001**
- **Type:** Bill of Lading
- **Date:** 2024-03-01
- **Relevance:** 95%
- **Summary:** Copper concentrate shipment from Chile to Rotterdam
- **Key Terms:** copper, concentrate, 15,000 MT

**2. Contract - CNT-CU-2024-15**
- **Type:** Contract
- **Date:** 2024-02-15
- **Relevance:** 87%
- **Summary:** Supply agreement for copper cathodes
- **Key Terms:** copper cathodes, delivery terms, pricing

[Additional results...]
```

#### Requirements

- **PostgreSQL**: Document metadata storage
- **Qdrant**: Vector embeddings for semantic search
- **Embeddings Model**: Text embedding generation

### 3. QueryTradesTool

**Purpose**: Query financial trading data and positions from the database.

**File**: `src/services/langchain/tools/QueryTradesTool.ts`

#### Schema

```typescript
const QueryTradesSchema = z.object({
  query_type: z.enum(['positions', 'trades', 'balances', 'exposures']).describe("Type of financial data to query"),
  filters: z.object({
    date_from: z.string().optional().describe("Start date (YYYY-MM-DD)"),
    date_to: z.string().optional().describe("End date (YYYY-MM-DD)"),
    commodity: z.string().optional().describe("Commodity type (e.g., copper, aluminum)"),
    account: z.string().optional().describe("Trading account"),
    currency: z.string().optional().describe("Currency (USD, EUR, etc.)")
  }).optional(),
  limit: z.number().default(50).describe("Maximum number of records")
});
```

#### Usage Examples

```typescript
// Position queries
"What are our current copper positions?"
"Show me aluminum exposure by account"
"Get all positions for account LME42200"

// Trade analysis
"Show copper trades from last week"
"Find large trades over $1M in Q3"
"What trades affected our EUR exposure?"

// Balance inquiries
"What's our cash balance in USD?"
"Show margin requirements by currency"
"Get collateral positions for risk analysis"
```

#### Response Format

```markdown
💰 **Trading Data Query Results**

**Query:** Current copper positions
**Type:** positions
**Records:** 15 positions found

**Summary:**
- **Net Position:** +2,847 MT (Long)
- **Market Value:** $24,156,789 USD
- **Unrealized P&L:** +$342,156 USD

**Top Positions:**
1. **LME42200** | 1,250 MT Long | $10.5M value | +$145K P&L
2. **LME42202** | 897 MT Long | $7.6M value | +$89K P&L
3. **LME42225** | 700 MT Long | $5.9M value | +$67K P&L

**Risk Metrics:**
- **VaR (95%):** $289,000
- **Exposure:** 65% of total portfolio
```

#### Data Sources

- `financial.net_positions`: Current position data
- `financial.cash_positions`: Cash and collateral balances  
- `financial.margin_usage`: Margin requirements
- `stonex.*`: Raw trading data from StoneX accounts

### 4. GetDashboardTool

**Purpose**: Retrieve pre-built dashboard data and analytics.

**File**: `src/services/langchain/tools/GetDashboardTool.ts`

#### Schema

```typescript
const GetDashboardSchema = z.object({
  dashboard_type: z.enum(['risk', 'positions', 'cash', 'overview']).describe("Type of dashboard data"),
  time_period: z.enum(['day', 'week', 'month', 'quarter']).default('day').describe("Time period for analysis"),
  format: z.enum(['summary', 'detailed', 'charts']).default('summary').describe("Level of detail")
});
```

#### Usage Examples

```typescript
// Dashboard requests
"Show me the risk dashboard"
"Get weekly positions overview"
"Display cash management dashboard"
"Generate monthly performance summary"

// Specific requests
{
  dashboard_type: "risk",
  time_period: "month", 
  format: "detailed"
}
```

#### Available Dashboards

**Risk Dashboard:**
- VaR calculations (95%, 99% confidence)
- Stress test scenarios
- Concentration risk metrics
- Correlation analysis

**Positions Dashboard:**
- Asset allocation breakdown
- Performance attribution
- Position sizing analysis
- Sector/commodity exposure

**Cash Dashboard:**
- Liquidity positions by currency
- Margin utilization
- Cash flow projections
- Collateral management

**Overview Dashboard:**
- Key performance indicators
- P&L summary
- Risk-adjusted returns
- Operational metrics

### 5. AnalyzeRiskTool

**Purpose**: Perform sophisticated risk analysis calculations and assessments.

**File**: `src/services/langchain/tools/AnalyzeRiskTool.ts`

#### Schema

```typescript
const AnalyzeRiskSchema = z.object({
  analysis_type: z.enum(['portfolio', 'commodity', 'counterparty', 'operational']).describe("Type of risk analysis"),
  parameters: z.object({
    confidence_level: z.number().min(0.8).max(0.99).default(0.95).describe("Confidence level for VaR"),
    time_horizon: z.number().min(1).max(252).default(1).describe("Time horizon in days"),
    commodity: z.string().optional().describe("Specific commodity for analysis"),
    scenario: z.enum(['base', 'stress', 'extreme']).default('base').describe("Risk scenario")
  }).optional()
});
```

#### Analysis Types

**Portfolio Risk:**
```markdown
🎯 **Portfolio Risk Analysis**

**Value at Risk (VaR):**
- **1-Day VaR (95%):** $456,789
- **10-Day VaR (95%):** $1,442,156
- **Expected Shortfall:** $678,234

**Risk Decomposition:**
- **Commodity Risk:** 72% ($328,000)
- **Currency Risk:** 18% ($82,000)
- **Basis Risk:** 10% ($46,000)

**Concentration Risk:**
- **Single Commodity Max:** 45% (Copper)
- **Geographic Concentration:** 35% (Asia-Pacific)
- **Counterparty Concentration:** 25% (Top 3 counterparties)
```

**Commodity Risk:**
```markdown
⚡ **Copper Risk Analysis**

**Price Volatility:**
- **Historical Vol (30d):** 24.5%
- **Implied Vol:** 26.2%
- **Vol of Vol:** 45%

**Correlation Matrix:**
- **LME Copper:** 1.00
- **Shanghai Copper:** 0.94
- **USD/CNY:** -0.67
- **Baltic Dry Index:** 0.23

**Stress Test Results:**
- **2008 Crisis Scenario:** -$2.4M (-15.6%)
- **China Slowdown:** -$1.8M (-11.2%)  
- **Supply Disruption:** +$3.1M (+18.9%)
```

### 6. GetFinancialSummaryTool

**Purpose**: Generate comprehensive financial summaries and reports.

**File**: `src/services/langchain/tools/GetFinancialSummaryTool.ts`

#### Schema

```typescript
const GetFinancialSummarySchema = z.object({
  report_type: z.enum(['pnl', 'balance', 'exposure', 'margin', 'performance']).describe("Type of financial report"),
  period: z.enum(['current', 'daily', 'weekly', 'monthly', 'quarterly', 'ytd']).default('current').describe("Reporting period"),
  currency: z.string().default('USD').describe("Reporting currency"),
  include_breakdown: z.boolean().default(true).describe("Include detailed breakdown")
});
```

#### Report Types

**P&L Report:**
```markdown
💹 **Profit & Loss Summary**

**Period:** March 2024 (MTD)
**Currency:** USD

**Trading P&L:**
- **Realized P&L:** +$1,245,678
- **Unrealized P&L:** +$432,156  
- **Total Trading P&L:** +$1,677,834

**Breakdown by Commodity:**
- **Copper:** +$945,234 (56.3%)
- **Aluminum:** +$423,156 (25.2%)
- **Zinc:** +$189,444 (11.3%)
- **Other:** +$120,000 (7.2%)

**Risk Metrics:**
- **Sharpe Ratio:** 1.47
- **Max Drawdown:** -2.3%
- **Hit Ratio:** 67%
```

**Balance Sheet:**
```markdown
🏦 **Balance Sheet Summary**

**Assets:**
- **Cash & Equivalents:** $12,456,789
- **Commodity Positions:** $8,934,567
- **Margin Deposits:** $3,567,890
- **Other Assets:** $567,234
- **Total Assets:** $25,526,480

**Liabilities:**
- **Margin Requirements:** $2,345,678
- **Accrued Expenses:** $234,567
- **Other Liabilities:** $123,456
- **Total Liabilities:** $2,703,701

**Equity:**
- **Contributed Capital:** $20,000,000
- **Retained Earnings:** $2,822,779
- **Total Equity:** $22,822,779
```

## Tool Selection Logic

The agent uses several factors to select appropriate tools:

### Description-Based Selection

Tools provide descriptions that help the agent understand their capabilities:

```typescript
const toolDescriptions = {
  track_vessel: "Get real-time vessel tracking information by B/L number. Returns REAL vessel data from Terminal49 API.",
  search_documents: "Search for documents by type, category, or content using semantic search. Returns REAL document data from the system database.",
  query_trades: "Query trading positions, balances, and transaction data from financial database. Returns REAL trading data.",
  get_dashboard: "Retrieve dashboard analytics and KPIs for risk, positions, cash management. Returns REAL dashboard data.",
  analyze_risk: "Perform risk analysis including VaR, stress testing, and portfolio risk metrics. Returns REAL risk calculations.",
  get_financial_summary: "Generate financial reports including P&L, balance sheet, and performance metrics. Returns REAL financial data."
};
```

### Context-Aware Selection

The agent considers query context and keywords:

```typescript
const keywordMappings = {
  // Vessel tracking keywords
  ["track", "vessel", "b/l", "bill of lading", "shipment", "cargo"]: "track_vessel",
  
  // Document search keywords  
  ["document", "contract", "invoice", "search", "find"]: "search_documents",
  
  // Trading keywords
  ["position", "trade", "balance", "exposure", "commodity"]: "query_trades",
  
  // Dashboard keywords
  ["dashboard", "overview", "summary", "kpi"]: "get_dashboard",
  
  // Risk keywords
  ["risk", "var", "volatility", "stress", "correlation"]: "analyze_risk",
  
  // Financial keywords
  ["pnl", "profit", "loss", "balance sheet", "performance"]: "get_financial_summary"
};
```

### Multi-Tool Coordination

For complex queries, the agent may use multiple tools in sequence:

```typescript
// Example: "Analyze the financial impact of vessel delays"
// 1. track_vessel - Get vessel status and identify delays
// 2. search_documents - Find related contracts and terms
// 3. query_trades - Get affected trading positions
// 4. analyze_risk - Calculate impact scenarios
// 5. get_financial_summary - Generate impact assessment
```

## Tool Development Guidelines

### Adding New Tools

1. **Create Tool Class**
```typescript
export class YourNewTool extends DynamicTool {
  constructor() {
    super({
      name: "your_tool_name",
      description: "Clear description of what this tool does",
      schema: YourToolSchema,
      func: async (input) => await this.executeFunction(input)
    });
  }
}
```

2. **Define Input Schema**
```typescript
const YourToolSchema = z.object({
  required_param: z.string().describe("Description for the agent"),
  optional_param: z.number().optional().default(100).describe("Optional parameter")
});
```

3. **Implement Function**
```typescript
private async executeFunction(args: any): Promise<string> {
  try {
    const result = await this.performOperation(args);
    return this.formatResponse(result);
  } catch (error) {
    logger.error(`${this.name} error:`, error);
    return `Error executing ${this.name}: ${error.message}`;
  }
}
```

4. **Add to Agent**
```typescript
// In CloverReActAgent.ts constructor
this.tools = [
  // ... existing tools
  new YourNewTool(),
];
```

### Best Practices

1. **Clear Descriptions**: Help the agent understand when to use your tool
2. **Input Validation**: Use Zod schemas for type safety
3. **Error Handling**: Graceful degradation with helpful error messages
4. **Consistent Formatting**: Use markdown formatting for structured output
5. **Logging**: Log operations for debugging and monitoring
6. **Testing**: Include unit tests for tool functionality

### Tool Response Formatting

Tools should return well-formatted strings that the agent can present to users:

```typescript
// Good formatting
return `📊 **Analysis Results**

**Key Findings:**
- Finding 1: Description
- Finding 2: Description

**Recommendations:**
1. Recommendation 1
2. Recommendation 2

**Next Steps:**
- Action item 1
- Action item 2`;

// Poor formatting  
return "Results: value1=123, value2=456, recommendation=do something";
```

## Error Handling and Resilience

### Common Error Patterns

1. **API Failures**
```typescript
try {
  const result = await externalApi.call(params);
  return this.formatResponse(result);
} catch (apiError) {
  if (apiError.status === 429) {
    return "Rate limit exceeded. Please try again in a few minutes.";
  } else if (apiError.status === 404) {
    return "Data not found for the specified parameters.";
  } else {
    return `Service temporarily unavailable: ${apiError.message}`;
  }
}
```

2. **Data Validation Failures**
```typescript
const validated = YourToolSchema.safeParse(input);
if (!validated.success) {
  return `Invalid input parameters: ${validated.error.message}`;
}
```

3. **Timeout Handling**
```typescript
const timeoutPromise = new Promise((_, reject) => 
  setTimeout(() => reject(new Error('Operation timeout')), 10000)
);

try {
  const result = await Promise.race([
    this.performOperation(params),
    timeoutPromise
  ]);
  return result;
} catch (error) {
  return `Operation timed out. Please try again or contact support.`;
}
```

This comprehensive tool documentation provides everything needed to understand, use, and extend the tool system for academic research and practical applications.
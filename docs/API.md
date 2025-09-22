# API Documentation

This document describes the API interfaces and usage patterns for the LangChain Vessel Tracking Agent system.

## Core Agent API

### CloverReActAgent

The main agent class that orchestrates tool usage and reasoning.

#### Constructor

```typescript
class CloverReActAgent {
  constructor(config: CloverAgentConfig)
}

interface CloverAgentConfig {
  persona: 'admin' | 'management' | 'finance' | 'operations' | 'risk';
  temperature?: number; // 0.0 to 1.0, default 0.7
  maxTokens?: number;   // Default 4096
  extendedThinking?: {
    enabled: boolean;
    budgetTokens?: number; // Default based on persona
    includeInResponse?: boolean; // Default false
  };
}
```

#### Methods

##### processMessage()

Process a single message and return the complete result.

```typescript
async processMessage(input: string): Promise<CloverAgentResult>

interface CloverAgentResult {
  output: string;           // Formatted response text
  intermediateSteps: any[]; // LangChain intermediate steps
  toolsUsed: string[];      // Names of tools that were executed
  thinkingContent?: string; // Extended thinking output (if enabled)
}
```

**Example Usage:**

```typescript
const agent = new CloverReActAgent({ 
  persona: 'operations',
  temperature: 0.8 
});

const result = await agent.processMessage('Track vessel for B/L MSKU123456');
console.log('Response:', result.output);
console.log('Tools used:', result.toolsUsed);
```

##### streamMessage()

Stream the response in real-time using Server-Sent Events format.

```typescript
async streamMessage(input: string): Promise<Readable>
```

**Response Format:**
```
data: {"type": "start"}

data: {"type": "text", "text": "Partial response...", "metadata": {"toolsUsed": ["track_vessel"]}}

data: {"type": "end"}

data: [DONE]
```

**Example Usage:**

```typescript
const stream = await agent.streamMessage('Analyze shipping risks');

stream.on('data', (chunk) => {
  const data = chunk.toString();
  if (data.startsWith('data: ')) {
    const jsonStr = data.slice(6);
    if (jsonStr.trim() !== '[DONE]') {
      const parsed = JSON.parse(jsonStr);
      if (parsed.type === 'text') {
        console.log('Received:', parsed.text);
      }
    }
  }
});
```

##### getAvailableTools()

Get list of available tool names.

```typescript
getAvailableTools(): string[]
```

##### getPersona()

Get current persona.

```typescript
getPersona(): string
```

## Tool APIs

### TrackVesselTool

Tracks vessels using Bill of Lading numbers via Terminal49 API.

#### Schema

```typescript
interface TrackVesselInput {
  bl_number: string; // Bill of Lading number
}
```

#### Response Format

```typescript
interface VesselTrackingData {
  vessel_name?: string;
  carrier_name?: string;
  status?: string;
  pol_name?: string;        // Port of loading
  pod_name?: string;        // Port of discharge
  current_location?: string;
  eta?: string;             // ISO date string
  container_count?: number;
  last_update?: string;     // ISO date string
}
```

#### Example Tool Usage

```typescript
// Tool is automatically selected by agent based on query
const result = await agent.processMessage('Track vessel for B/L MSKU123456789');

// Direct tool usage (for testing)
const tool = new TrackVesselTool();
const response = await tool.func({ bl_number: 'MSKU123456789' });
```

### DocumentSearchTool

Searches documents using semantic search capabilities.

#### Schema

```typescript
interface DocumentSearchInput {
  query: string;
  document_type?: 'bill_of_lading' | 'contract' | 'invoice' | 'warehouse_release' | 'certificate' | 'all';
  category?: 'Administrative' | 'Financial' | 'Legal' | 'Operational' | 'all';
  limit?: number; // Default 10
}
```

#### Example

```typescript
const result = await agent.processMessage('Find all bills of lading from last month');
```

### QueryTradesTool

Queries trading and financial data from the database.

#### Schema

```typescript
interface QueryTradesInput {
  query_type: 'positions' | 'trades' | 'balances' | 'exposures';
  filters?: {
    date_from?: string;
    date_to?: string;
    commodity?: string;
    account?: string;
  };
  limit?: number; // Default 50
}
```

### GetDashboardTool

Retrieves dashboard data and analytics.

#### Schema

```typescript
interface GetDashboardInput {
  dashboard_type: 'risk' | 'positions' | 'cash' | 'overview';
  time_period?: 'day' | 'week' | 'month' | 'quarter';
}
```

### AnalyzeRiskTool

Performs risk analysis on specified data.

#### Schema

```typescript
interface AnalyzeRiskInput {
  analysis_type: 'portfolio' | 'commodity' | 'counterparty' | 'operational';
  parameters?: {
    confidence_level?: number; // e.g., 0.95 for 95% VaR
    time_horizon?: number;     // days
    commodity?: string;
  };
}
```

### GetFinancialSummaryTool

Generates financial summaries and reports.

#### Schema

```typescript
interface GetFinancialSummaryInput {
  report_type: 'pnl' | 'balance' | 'exposure' | 'margin';
  period?: 'current' | 'daily' | 'monthly' | 'quarterly';
  currency?: string; // Default 'USD'
}
```

## Extended Thinking API

### ExtendedThinkingChatAnthropic

Custom ChatAnthropic implementation with Extended Thinking support.

#### Configuration

```typescript
const model = new ExtendedThinkingChatAnthropic({
  modelName: 'claude-3-5-sonnet-20241022',
  temperature: 1, // Required for Extended Thinking
  maxTokens: 8192,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  extendedThinking: {
    enabled: true,
    budgetTokens: 10000,
    includeInResponse: false
  }
});
```

#### Thinking Parameter Format

```typescript
interface ThinkingParameter {
  type: 'deep_analysis' | 'strategic' | 'technical' | 'creative';
  budget_tokens: number;
  instructions?: string;
}
```

## Service APIs

### Terminal49Service

Wrapper for Terminal49 API integration.

#### Methods

```typescript
class Terminal49Service {
  async trackVessel(blNumber: string): Promise<VesselTrackingData | null>
  async searchShipments(params: SearchParams): Promise<ShipmentData[]>
  async getContainerDetails(containerId: string): Promise<ContainerData>
}
```

#### Configuration

```typescript
const service = new Terminal49Service({
  apiKey: process.env.TERMINAL49_API_KEY,
  baseUrl: 'https://api.terminal49.com/v2',
  timeout: 10000,
  retryAttempts: 3
});
```

### ExtendedThinkingService

Manages Extended Thinking activation and configuration.

#### Methods

```typescript
class ExtendedThinkingService {
  shouldEnableExtendedThinking(params: ThinkingAnalysisParams): ThinkingResult
  formatThinkingParameter(result: ThinkingResult): ThinkingParameter
  processThinkingOutput(thinking: string, type: string): ThinkingOutput
  calculateComplexity(query: string, context?: any): number
}
```

#### Types

```typescript
interface ThinkingAnalysisParams {
  model: string;
  complexity: number;
  personaId: string;
  userPreference?: {
    enabled: boolean;
    budgetTokens?: number;
  };
}

interface ThinkingResult {
  enabled: boolean;
  thinkingType: string;
  budgetTokens: number;
  reasoning: string;
}
```

## Error Handling

### Error Types

```typescript
class AgentError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
  }
}

// Common error codes
const ErrorCodes = {
  TOOL_EXECUTION_FAILED: 'TOOL_EXECUTION_FAILED',
  PARSING_FAILED: 'PARSING_FAILED',
  API_KEY_MISSING: 'API_KEY_MISSING',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  EXTENDED_THINKING_FAILED: 'EXTENDED_THINKING_FAILED'
};
```

### Error Response Format

```typescript
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
  };
}
```

### Handling Errors

```typescript
try {
  const result = await agent.processMessage(query);
} catch (error) {
  if (error instanceof AgentError) {
    console.error('Agent error:', error.code, error.message);
    
    switch (error.code) {
      case ErrorCodes.API_KEY_MISSING:
        // Handle missing API key
        break;
      case ErrorCodes.TOOL_EXECUTION_FAILED:
        // Handle tool failure
        break;
      default:
        // Generic error handling
    }
  }
}
```

## Response Processing

### AgentResponseProcessor

Utility for cleaning and formatting agent responses.

```typescript
class AgentResponseProcessor {
  static processResponse(
    rawOutput: string,
    options: ProcessorOptions = {}
  ): string
}

interface ProcessorOptions {
  persona: string;
  removeReActFormat?: boolean; // Default true
  addTimestamp?: boolean;      // Default false
  enhanceFormatting?: boolean; // Default true
}
```

## Logging and Monitoring

### Logger API

```typescript
import { logger } from './utils/logger';

// Log levels
logger.debug('Debug message', { metadata });
logger.info('Info message', { metadata });
logger.warn('Warning message', { metadata });
logger.error('Error message', { error, metadata });
```

### Performance Monitoring

```typescript
import { PerformanceMonitor } from './utils/performance';

const result = await PerformanceMonitor.measureExecution(
  'vessel_tracking',
  async () => {
    return await agent.processMessage('Track vessel ABC123');
  }
);
```

## Configuration

### Environment Variables

```bash
# Required
ANTHROPIC_API_KEY=your_anthropic_api_key

# Optional but recommended for vessel tracking
TERMINAL49_API_KEY=your_terminal49_api_key
TERMINAL49_PUBLISHABLE_KEY=your_terminal49_publishable_key

# Database (optional for full functionality)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=database_name
POSTGRES_USER=username
POSTGRES_PASSWORD=password

# Vector database (optional)
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=optional_key

# Application settings
NODE_ENV=development
PORT=3007
LOG_LEVEL=info

# Performance settings
MAX_TOKENS=8192
RATE_LIMIT_WINDOW=900000  # 15 minutes in ms
RATE_LIMIT_MAX=100        # requests per window
```

### Runtime Configuration

```typescript
// Create agent with specific configuration
const agent = new CloverReActAgent({
  persona: 'finance',
  temperature: 0.8,
  maxTokens: 6144,
  extendedThinking: {
    enabled: true,
    budgetTokens: 12000,
    includeInResponse: false
  }
});

// Override default tool selection
const customTools = [
  new TrackVesselTool(),
  new AnalyzeRiskTool()
];

// Custom prompt engineering
const customPrompt = `
You are a specialized maritime logistics AI assistant.
Focus on practical, actionable insights for supply chain operations.
`;
```

## Usage Patterns

### Simple Query Processing

```typescript
const agent = new CloverReActAgent({ persona: 'operations' });
const result = await agent.processMessage('What is the status of our shipments?');
```

### Complex Analysis with Extended Thinking

```typescript
const agent = new CloverReActAgent({
  persona: 'risk',
  extendedThinking: {
    enabled: true,
    budgetTokens: 15000
  }
});

const result = await agent.processMessage(`
  Analyze the risk exposure of our copper trading positions 
  considering current geopolitical tensions and their impact 
  on shipping routes through the Suez Canal.
`);
```

### Multi-Step Workflow

```typescript
const agent = new CloverReActAgent({ persona: 'management' });

// Step 1: Get current status
const status = await agent.processMessage('Get overview of all active shipments');

// Step 2: Analyze risks
const risks = await agent.processMessage('Identify potential risks in current operations');

// Step 3: Generate recommendations
const recommendations = await agent.processMessage(
  'Based on the current status and risks, provide strategic recommendations'
);
```

### Streaming for Long Operations

```typescript
const agent = new CloverReActAgent({
  persona: 'finance',
  extendedThinking: { enabled: true, budgetTokens: 20000 }
});

const stream = await agent.streamMessage(
  'Perform comprehensive financial analysis of Q4 trading performance'
);

let fullResponse = '';
stream.on('data', (chunk) => {
  const data = chunk.toString();
  if (data.startsWith('data: ')) {
    const jsonStr = data.slice(6);
    if (jsonStr.trim() !== '[DONE]') {
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed.type === 'text') {
          fullResponse += parsed.text;
          console.log('Progress:', parsed.text);
        }
      } catch (e) {
        // Handle parsing errors
      }
    }
  }
});

stream.on('end', () => {
  console.log('Analysis complete:', fullResponse);
});
```

This API documentation provides comprehensive coverage of all interfaces and usage patterns for academic research and development purposes.
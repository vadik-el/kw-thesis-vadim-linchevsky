# LangChain Vessel Tracking Agent - Master's Thesis Project

## Overview

This project demonstrates an advanced AI agent built with LangChain that integrates vessel tracking capabilities with Extended Thinking features from Anthropic's Claude. The system showcases a sophisticated multi-tool orchestration approach for maritime logistics and supply chain management.

## Key Features

### 🤖 Advanced Agent Architecture
- **ReAct Pattern Implementation**: Reasoning and Acting cycle for complex decision making
- **Extended Thinking Integration**: Claude's native thinking capabilities for deep analysis
- **Multi-Tool Orchestration**: Coordinates 6 different tools for comprehensive analysis
- **Persona-Based Intelligence**: 5 specialized AI personas (Admin, Management, Finance, Operations, Risk)

### 🚢 Vessel Tracking Capabilities
- **Real-time Tracking**: Integration with Terminal49 API for live vessel data
- **Bill of Lading Processing**: Track shipments using B/L numbers
- **Route Analysis**: Origin, destination, and current location tracking
- **ETA Predictions**: Estimated arrival times and delay analysis

### 🧠 Extended Thinking System
- **Complexity Detection**: Automatic activation based on query complexity
- **Dynamic Token Allocation**: Persona-specific thinking budgets
- **Hybrid Architecture**: Combines LangChain compatibility with direct Anthropic SDK
- **Fallback Mechanisms**: Graceful degradation to standard processing

### 🔧 Tool Ecosystem
1. **Track Vessel Tool** - Real-time vessel tracking via Terminal49
2. **Document Search Tool** - Semantic search across shipping documents
3. **Query Trades Tool** - Financial trading data analysis
4. **Dashboard Tool** - Analytics dashboard integration
5. **Risk Analysis Tool** - Risk assessment and compliance checking
6. **Financial Summary Tool** - P&L and financial impact analysis

## Architecture

```
┌─────────────────────┐    ┌──────────────────────┐    ┌─────────────────────┐
│   User Query        │───▶│  CloverReActAgent    │───▶│  ExtendedThinking   │
│                     │    │                      │    │  ChatAnthropic      │
└─────────────────────┘    └──────────────────────┘    └─────────────────────┘
                                       │
                                       ▼
                           ┌──────────────────────┐
                           │   Tool Selection     │
                           │   & Orchestration    │
                           └──────────────────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    ▼                  ▼                  ▼
        ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
        │ TrackVesselTool │ │DocumentSearchTool│ │    ...More      │
        │                 │ │                 │ │    Tools        │
        └─────────────────┘ └─────────────────┘ └─────────────────┘
                    │                  │                  │
                    ▼                  ▼                  ▼
        ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
        │ Terminal49 API  │ │  Vector DB      │ │  Database       │
        │                 │ │  (Qdrant)       │ │  (PostgreSQL)   │
        └─────────────────┘ └─────────────────┘ └─────────────────┘
```

## Technical Implementation

### Core Components

1. **CloverReActAgent** (`src/services/langchain/CloverReActAgent.ts`)
   - Main agent orchestrator using LangChain's ReAct pattern
   - Supports both standard and Extended Thinking modes
   - Handles parsing failures and error recovery
   - Streaming response capabilities

2. **ExtendedThinkingChatAnthropic** (`src/services/langchain/ExtendedThinkingChatAnthropic.ts`)
   - Custom ChatAnthropic wrapper with Extended Thinking support
   - Combines LangChain compatibility with direct Anthropic SDK calls
   - Dynamic token budget allocation and complexity analysis

3. **TrackVesselTool** (`src/services/langchain/tools/TrackVesselTool.ts`)
   - LangChain DynamicTool implementation for vessel tracking
   - Integrates with Terminal49 API for real vessel data
   - Structured output formatting with error handling

### Extended Thinking Integration

The system implements Claude's Extended Thinking feature through a sophisticated wrapper:

```typescript
// Automatic complexity detection
const thinkingResult = this.extendedThinkingService.shouldEnableExtendedThinking({
  model: 'claude-3-5-sonnet-20241022',
  complexity: 0.8, // High complexity for agent operations
  personaId: 'operations',
  userPreference: { enabled: true, budgetTokens: 10000 }
});

// API call with thinking parameter
const response = await this.anthropicClient.messages.create({
  model: this.modelName,
  max_tokens: budgetTokens + 4096,
  temperature: 1, // Required for Extended Thinking
  messages: anthropicMessages,
  thinking: thinkingParam
});
```

### Persona System

The agent supports 5 specialized personas with different capabilities and token budgets:

- **Admin** (10K tokens): System operations and technical queries
- **Management** (12K tokens): Strategic analysis and KPIs  
- **Finance** (15K tokens): Complex financial calculations and P&L analysis
- **Operations** (8K tokens): Practical logistics and supply chain focus
- **Risk** (20K tokens): Deep risk analysis and compliance assessment

## Usage Examples

### Simple Vessel Tracking
```typescript
const agent = new CloverReActAgent({ persona: 'operations' });
const result = await agent.processMessage('Track vessel for B/L MSKU123456');
```

### Complex Multi-Tool Analysis
```typescript
const agent = new CloverReActAgent({ 
  persona: 'finance',
  extendedThinking: { enabled: true, budgetTokens: 15000 }
});
const result = await agent.processMessage(
  'Analyze the financial impact of delays on our copper shipments this quarter'
);
```

### Streaming Response
```typescript
const stream = await agent.streamMessage('What is the status of vessel MSC OSCAR?');
stream.on('data', (chunk) => {
  console.log('Received:', chunk);
});
```

## Research Applications

This system demonstrates several key concepts relevant to AI and computer science research:

1. **Multi-Modal AI Integration**: Combining text processing, API integration, and real-time data
2. **Agent Architecture Patterns**: ReAct pattern implementation with tool orchestration
3. **Extended Reasoning Systems**: Integration of deep thinking capabilities with tool usage
4. **Error Recovery Mechanisms**: Robust handling of parsing failures and API errors
5. **Streaming AI Responses**: Real-time response generation for complex queries
6. **Persona-Based AI**: Role-specific behavior adaptation and token budget management

## Files Structure

```
kw_thesis/
├── README.md                          # This file
├── ARCHITECTURE.md                    # Detailed architecture documentation
├── IMPLEMENTATION.md                  # Implementation guide
├── SETUP.md                          # Setup and installation guide
├── package.json                      # Dependencies
├── .env.example                      # Environment variables
├── src/
│   ├── services/
│   │   ├── langchain/
│   │   │   ├── CloverReActAgent.ts           # Main ReAct agent
│   │   │   ├── LangChainCloverService.ts     # Service wrapper
│   │   │   ├── AgentResponseProcessor.ts     # Response formatting
│   │   │   ├── ExtendedThinkingChatAnthropic.ts # Extended Thinking wrapper
│   │   │   └── tools/                        # Tool implementations
│   │   ├── terminal49Service.ts              # Terminal49 API client
│   │   ├── extendedThinkingService.ts        # Extended Thinking service
│   │   ├── queryService.ts                   # Database queries
│   │   └── vectorService.ts                  # Vector database integration
│   ├── utils/                               # Utility functions
│   ├── types/                               # TypeScript definitions
│   └── examples/                            # Usage examples
└── docs/                                    # Additional documentation
```

## Next Steps

1. **Setup Environment**: Follow the SETUP.md guide to configure your environment
2. **Review Architecture**: Read ARCHITECTURE.md for detailed system design
3. **Run Examples**: Test the system with the provided examples
4. **Customize Tools**: Add your own tools or modify existing ones
5. **Experiment**: Try different personas and Extended Thinking configurations

## Academic References

This implementation draws from several key research areas:

- **ReAct: Synergizing Reasoning and Acting in Language Models** (Yao et al., 2023)
- **LangChain Framework for LLM Applications** (Chase, 2022)
- **Extended Thinking in Large Language Models** (Anthropic, 2024)
- **Tool Learning with Foundation Models** (Qin et al., 2023)
- **Multi-Agent Systems and Tool Use** (Schick et al., 2024)

## License

This project is created for academic research purposes as part of a master's thesis.
# Setup and Installation Guide

This guide will help you set up the LangChain Vessel Tracking Agent for your thesis project.

## Prerequisites

### System Requirements

- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 8.0.0 or higher (comes with Node.js)
- **TypeScript**: Version 5.0.0 or higher
- **Operating System**: Windows 10+, macOS 10.15+, or Linux

### Required API Keys

You'll need the following API keys to run the full system:

1. **Anthropic API Key** (Required)
   - Sign up at: https://console.anthropic.com/
   - Create an API key in your dashboard
   - Provides access to Claude models and Extended Thinking

2. **Terminal49 API Key** (Optional, for vessel tracking)
   - Sign up at: https://terminal49.com/
   - Get API key from developer dashboard
   - Note: Standard tier has limitations (see Terminal49 Integration section)

3. **Database Access** (Optional, for document search tools)
   - PostgreSQL database for document storage
   - Qdrant vector database for semantic search

## Installation Steps

### 1. Clone/Navigate to Project

```bash
# If you received this as a standalone project
cd kw_thesis

# Or if you're in the parent directory
cd path/to/kw_thesis
```

### 2. Install Dependencies

```bash
# Install all required packages
npm install

# This will install:
# - LangChain packages (@langchain/*)
# - Anthropic SDK
# - Database clients (pg, qdrant)
# - Utility packages (axios, winston, zod)
# - Development tools (tsx, typescript, eslint)
```

### 3. Environment Configuration

```bash
# Copy the environment template
cp .env.example .env

# Edit the .env file with your API keys
nano .env
# or use your preferred editor
```

### 4. Configure Environment Variables

Edit the `.env` file and add your API keys:

```bash
# Required for AI functionality
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Optional for vessel tracking
TERMINAL49_API_KEY=your_terminal49_api_key_here
TERMINAL49_PUBLISHABLE_KEY=your_terminal49_publishable_key_here

# Optional for document search (if using database tools)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=your_database_name
POSTGRES_USER=your_username
POSTGRES_PASSWORD=your_password

QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=your_qdrant_key_if_required

# Application settings
NODE_ENV=development
LOG_LEVEL=debug
```

### 5. Build the Project

```bash
# Compile TypeScript to JavaScript
npm run build
```

## Quick Start

### 1. Basic Test

Create and run a simple test to verify the installation:

```bash
# Run the example test file
npm test
```

This will execute the test file at `src/examples/test-vessel-tracking.ts`.

### 2. Development Mode

For active development with hot reloading:

```bash
# Start in development mode with file watching
npm run dev
```

## Configuration Options

### Agent Personas

The system supports 5 different personas. Configure in your code:

```typescript
const personas = {
  admin: { budgetTokens: 10000, focus: 'technical' },
  management: { budgetTokens: 12000, focus: 'strategic' },
  finance: { budgetTokens: 15000, focus: 'financial' },
  operations: { budgetTokens: 8000, focus: 'practical' },
  risk: { budgetTokens: 20000, focus: 'analysis' }
};
```

### Extended Thinking Settings

Configure Extended Thinking behavior:

```typescript
const extendedThinkingConfig = {
  enabled: true,
  budgetTokens: 10000,        // Default thinking budget
  includeInResponse: false,   // Whether to include thinking in response
  complexityThreshold: 0.6    // Minimum complexity to trigger thinking
};
```

### Tool Configuration

Enable/disable specific tools based on your needs:

```typescript
const enabledTools = {
  trackVessel: true,      // Requires Terminal49 API
  searchDocuments: false, // Requires database setup
  queryTrades: false,     // Requires database setup
  getDashboard: false,    // Requires database setup
  analyzeRisk: true,      // Works with basic setup
  getFinancialSummary: false // Requires database setup
};
```

## Database Setup (Optional)

### PostgreSQL Setup

If you want to use document search and financial tools:

```bash
# Install PostgreSQL (Ubuntu/Debian)
sudo apt-get install postgresql postgresql-contrib

# Install PostgreSQL (macOS with Homebrew)
brew install postgresql

# Create database and user
sudo -u postgres psql
CREATE DATABASE thesis_db;
CREATE USER thesis_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE thesis_db TO thesis_user;
```

### Qdrant Setup (Optional)

For semantic document search:

```bash
# Using Docker
docker run -p 6333:6333 qdrant/qdrant

# Or install locally (see Qdrant documentation)
```

## Terminal49 Integration

### API Tier Limitations

The system currently supports Terminal49's Standard tier:

**Available Data**:
- ✅ Bill of Lading tracking
- ✅ Vessel names and IMO numbers
- ✅ Carrier information
- ✅ Port names and shipment status
- ✅ Container numbers
- ✅ Event timestamps

**Premium Tier Features** (not available in Standard):
- ❌ Real-time vessel coordinates
- ❌ Position tracking on maps
- ❌ Route visualization

### Configuration

```typescript
const terminal49Config = {
  apiKey: process.env.TERMINAL49_API_KEY,
  baseUrl: 'https://api.terminal49.com/v2',
  timeout: 10000,
  retryAttempts: 3
};
```

## Testing Your Setup

### 1. Basic Functionality Test

```typescript
// src/examples/basic-test.ts
import { CloverReActAgent } from './src/services/langchain/CloverReActAgent';

async function testBasicSetup() {
  const agent = new CloverReActAgent({ persona: 'admin' });
  const result = await agent.processMessage('Hello, can you help me?');
  console.log('Agent Response:', result.output);
}

testBasicSetup();
```

### 2. Extended Thinking Test

```typescript
async function testExtendedThinking() {
  const agent = new CloverReActAgent({
    persona: 'finance',
    extendedThinking: { enabled: true, budgetTokens: 5000 }
  });
  
  const result = await agent.processMessage(
    'Analyze the financial implications of supply chain delays'
  );
  console.log('Extended Thinking Result:', result.output);
}
```

### 3. Vessel Tracking Test

```typescript
async function testVesselTracking() {
  const agent = new CloverReActAgent({ persona: 'operations' });
  const result = await agent.processMessage('Track vessel for B/L MSKU123456');
  console.log('Vessel Tracking Result:', result.output);
}
```

## Troubleshooting

### Common Issues

#### 1. API Key Issues

```bash
Error: Invalid API key
```

**Solution**:
- Verify your API key is correctly set in `.env`
- Ensure no extra spaces or quotes
- Check that the key has proper permissions

#### 2. Module Import Errors

```bash
Error: Cannot resolve module
```

**Solution**:
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install

# Rebuild TypeScript
npm run build
```

#### 3. Extended Thinking Not Working

**Check**:
- Temperature must be 1.0 for Extended Thinking
- Budget tokens should be > 0
- API key must have Extended Thinking access

#### 4. Tool Execution Failures

**Debug**:
```typescript
// Enable detailed logging
process.env.LOG_LEVEL = 'debug';

// Check tool availability
const tools = agent.getAvailableTools();
console.log('Available tools:', tools);
```

### Performance Optimization

#### 1. Memory Usage

```bash
# Increase Node.js memory limit
node --max-old-space-size=4096 dist/examples/test-vessel-tracking.js
```

#### 2. Response Time

```typescript
// Reduce thinking budget for faster responses
const quickConfig = {
  persona: 'operations',
  extendedThinking: { enabled: true, budgetTokens: 2000 }
};
```

## Development Workflow

### 1. Code Organization

```
src/
├── services/           # Core agent and service implementations
├── utils/             # Utility functions and helpers
├── types/             # TypeScript type definitions
└── examples/          # Test and example files
```

### 2. Adding New Tools

```typescript
// 1. Create new tool file
// src/services/langchain/tools/YourNewTool.ts

import { DynamicTool } from "@langchain/core/tools";
import { z } from "zod";

const YourNewToolSchema = z.object({
  parameter: z.string().describe("Parameter description")
});

export class YourNewTool extends DynamicTool {
  constructor() {
    super({
      name: "your_new_tool",
      description: "What your tool does",
      schema: YourNewToolSchema,
      func: async (input) => await this.executeFunction(input)
    });
  }

  private async executeFunction(args: any): Promise<string> {
    // Your tool implementation
    return "Tool result";
  }
}

// 2. Add to CloverReActAgent.ts
import { YourNewTool } from './tools/YourNewTool';

// In constructor:
this.tools = [
  // ... existing tools
  new YourNewTool(),
];
```

### 3. Testing Changes

```bash
# Run tests
npm test

# Run in development mode
npm run dev

# Build and run
npm run build
npm start
```

## Production Deployment

### Environment Setup

```bash
# Set production environment
NODE_ENV=production

# Use production logging
LOG_LEVEL=info
LOG_FORMAT=json

# Enable rate limiting
ENABLE_RATE_LIMITING=true
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100
```

### Security Considerations

1. **API Key Security**: Store keys in secure environment variables
2. **Input Validation**: All inputs validated through Zod schemas
3. **Rate Limiting**: Prevent API abuse
4. **Error Handling**: Don't expose internal errors to users
5. **Logging**: Log security events but not sensitive data

### Monitoring

```typescript
// Add monitoring for production
import { logger } from './src/utils/logger';

// Log important events
logger.info('Agent initialized', { persona, timestamp: new Date() });
logger.error('Tool execution failed', { tool: 'track_vessel', error });
```

## Next Steps

1. **Review Documentation**: Read ARCHITECTURE.md and IMPLEMENTATION.md
2. **Run Examples**: Execute the provided test files
3. **Customize Configuration**: Adjust settings for your specific needs
4. **Add Your Own Tools**: Extend the system with domain-specific functionality
5. **Conduct Experiments**: Use different personas and configurations for your research

## Support

For issues related to this thesis project:

1. **Check Logs**: Review console output and log files
2. **Verify Configuration**: Ensure all environment variables are set
3. **Test Components**: Isolate issues to specific components
4. **Documentation**: Review the comprehensive documentation provided

## Academic Usage Notes

This system is designed for academic research and includes:

- **Comprehensive Logging**: All operations logged for analysis
- **Configurable Parameters**: Easy to modify for experiments
- **Performance Metrics**: Built-in timing and usage tracking
- **Documentation**: Detailed architectural and implementation docs
- **Examples**: Multiple usage patterns demonstrated

The system demonstrates several research-relevant concepts:
- Agent architecture patterns
- Tool orchestration in LLMs
- Extended reasoning capabilities
- Multi-modal AI integration
- Real-time streaming responses
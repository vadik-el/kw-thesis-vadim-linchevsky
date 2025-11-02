# MCP Client Connection Guide

How to connect to your Vessel Tracking MCP Server from various MCP clients.

## Table of Contents

1. [Claude Desktop](#claude-desktop)
2. [MCP Inspector (Testing)](#mcp-inspector-testing)
3. [Custom Python Client](#custom-python-client)
4. [Custom TypeScript Client](#custom-typescript-client)
5. [Available Tools](#available-tools)
6. [Example Queries](#example-queries)

---

## Claude Desktop

### macOS

1. **Open configuration file**:
```bash
code ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

2. **Add your MCP server**:
```json
{
  "mcpServers": {
    "vessel-tracking": {
      "url": "https://your-domain.com/mcp",
      "headers": {
        "Authorization": "Bearer vt_your_api_key_here"
      },
      "description": "Vessel tracking and maritime analytics"
    }
  }
}
```

3. **Restart Claude Desktop**

4. **Verify connection**:
   - Open Claude Desktop
   - Look for 🔌 icon indicating MCP servers connected
   - Try asking: "What tools are available for vessel tracking?"

### Windows

1. **Open configuration file**:
```powershell
notepad %APPDATA%\Claude\claude_desktop_config.json
```

2. **Add configuration** (same as macOS above)

3. **Restart Claude Desktop**

### Linux

1. **Open configuration file**:
```bash
nano ~/.config/Claude/claude_desktop_config.json
```

2. **Add configuration** (same as macOS above)

3. **Restart Claude Desktop**

---

## MCP Inspector (Testing)

The MCP Inspector is a useful tool for testing your MCP server during development.

### Installation

```bash
npm install -g @modelcontextprotocol/inspector
```

### Test Local Server (stdio mode)

```bash
# Terminal 1: Start MCP server in stdio mode
MCP_TRANSPORT_MODE=stdio npm run mcp:dev

# Terminal 2: Connect inspector
mcp-inspector stdio npm run mcp:dev
```

### Test Remote Server (HTTP mode)

```bash
# Connect to your deployed server
mcp-inspector http https://your-domain.com/mcp \
  --header "Authorization: Bearer vt_your_api_key"
```

You'll see a web interface at `http://localhost:5173` where you can:
- Browse available tools
- Test tool calls interactively
- View request/response logs
- Debug issues

---

## Custom Python Client

### Using Anthropic SDK with MCP

```python
from anthropic import Anthropic
import os

# Initialize client
client = Anthropic(api_key=os.environ['ANTHROPIC_API_KEY'])

# MCP server configuration
mcp_config = {
    "url": "https://your-domain.com/mcp",
    "headers": {
        "Authorization": f"Bearer {os.environ['MCP_API_KEY']}"
    }
}

# Make request with MCP tools available
response = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=2048,
    mcp_servers=[mcp_config],
    messages=[{
        "role": "user",
        "content": "Track vessel with B/L number MSKU123456"
    }]
)

print(response.content[0].text)
```

### Direct HTTP Client (for testing)

```python
import requests
import json

MCP_URL = "https://your-domain.com/mcp"
API_KEY = "vt_your_api_key_here"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

# List available tools
def list_tools():
    response = requests.post(
        f"{MCP_URL}/list-tools",
        headers=headers,
        json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
    )
    return response.json()

# Call a tool
def track_vessel(bl_number):
    response = requests.post(
        f"{MCP_URL}/call-tool",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": "track_vessel",
                "arguments": {
                    "bl_number": bl_number
                }
            }
        }
    )
    return response.json()

# Usage
tools = list_tools()
print("Available tools:", tools)

result = track_vessel("MSKU123456")
print("Tracking result:", result)
```

---

## Custom TypeScript Client

### Using Anthropic SDK

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const mcpConfig = {
  url: 'https://your-domain.com/mcp',
  headers: {
    'Authorization': `Bearer ${process.env.MCP_API_KEY}`,
  },
};

async function askClaude(query: string) {
  const response = await client.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 2048,
    mcpServers: [mcpConfig],
    messages: [{
      role: 'user',
      content: query,
    }],
  });

  return response.content[0].text;
}

// Usage
const result = await askClaude('Track vessel with B/L MSKU123456');
console.log(result);
```

### Using MCP SDK Directly

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

class VesselTrackingClient {
  private client: Client;

  async connect(url: string, apiKey: string) {
    const transport = new SSEClientTransport(
      new URL(url),
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      }
    );

    this.client = new Client(
      {
        name: 'vessel-tracking-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    await this.client.connect(transport);
  }

  async listTools() {
    const response = await this.client.listTools();
    return response.tools;
  }

  async trackVessel(blNumber: string) {
    const response = await this.client.callTool({
      name: 'track_vessel',
      arguments: {
        bl_number: blNumber,
      },
    });

    return response.content[0].text;
  }
}

// Usage
const client = new VesselTrackingClient();
await client.connect('https://your-domain.com/mcp', 'vt_your_api_key');

const tools = await client.listTools();
console.log('Available tools:', tools);

const result = await client.trackVessel('MSKU123456');
console.log('Result:', result);
```

---

## Available Tools

Your MCP server exposes these tools:

### 1. track_vessel
Track vessels in real-time using Terminal49 API.

**Parameters**:
- `bl_number` (string, required): Bill of Lading number

**Example**:
```json
{
  "name": "track_vessel",
  "arguments": {
    "bl_number": "MSKU123456"
  }
}
```

### 2. search_documents
Semantic search across shipping documents (requires vector DB setup).

**Parameters**:
- `query` (string, required): Search query
- `limit` (number, optional): Number of results (default: 5)

### 3. query_trades
Query trading and position data.

**Parameters**:
- `filters` (object, optional): Filter criteria
- `start_date` (string, optional): Start date (ISO 8601)
- `end_date` (string, optional): End date (ISO 8601)

### 4. get_dashboard
Retrieve analytics dashboard data.

**Parameters**:
- `dashboard_type` (string, required): Type of dashboard
- `time_range` (string, optional): Time range filter

### 5. analyze_risk
Perform risk analysis on shipments.

**Parameters**:
- `analysis_type` (string, required): Type of risk analysis
- `parameters` (object, required): Analysis parameters

### 6. get_financial_summary
Get P&L and financial impact summaries.

**Parameters**:
- `report_type` (string, required): Type of financial report
- `time_period` (string, optional): Time period for report

---

## Example Queries

Once connected to your MCP server through Claude Desktop or a custom client, you can ask:

### Vessel Tracking

```
"Track the vessel with B/L number MSKU123456"

"What's the current location of vessel for B/L COSU987654?"

"Show me all delayed shipments"
```

### Financial Analysis

```
"What's the financial impact of the delayed copper shipments this quarter?"

"Generate a P&L report for last month's maritime operations"

"Calculate demurrage costs for late arrivals"
```

### Risk Assessment

```
"Analyze the risk of delays for shipments going through the Suez Canal"

"What's our VaR (Value at Risk) for current open positions?"

"Perform a stress test on our shipping portfolio"
```

### Multi-Tool Queries

```
"Track vessel MSKU123456 and analyze the financial impact if it arrives 3 days late"

"Search for all documents related to copper shipments and calculate total value at risk"

"Show me the dashboard for Q4 operations and highlight high-risk shipments"
```

### Extended Thinking Queries (Complex Analysis)

These queries will automatically trigger Extended Thinking for deeper analysis:

```
"Analyze all shipments from the last quarter, identify patterns in delays, and recommend optimization strategies"

"Compare our vessel tracking efficiency against industry benchmarks and suggest improvements"

"What would be the cascading financial impact if our top 3 vessels are delayed by a week?"
```

---

## Troubleshooting Connection Issues

### Connection Timeout

```bash
# Test server accessibility
curl -I https://your-domain.com/mcp \
  -H "Authorization: Bearer vt_your_api_key"

# Should return 200 OK or SSE stream
```

### Authentication Errors

```json
// Error response:
{
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}

// Solutions:
// 1. Check API key is correct
// 2. Verify key exists in server's .env file
// 3. Regenerate key if needed
```

### Tools Not Appearing

1. **Restart Claude Desktop** completely
2. **Check configuration** syntax (valid JSON)
3. **Verify server** is running: `curl https://your-domain.com/health`
4. **Check logs** on server: `docker-compose logs mcp-server`

### Slow Responses

Some queries use Extended Thinking and may take 10-30 seconds. This is normal for complex analysis. Look for thinking indicators in responses.

---

## Rate Limits

The default nginx configuration limits requests to:
- **10 requests/second**
- **Burst of 20 requests**

If you hit rate limits, you'll see:
```
HTTP 429 Too Many Requests
```

Contact your server administrator to adjust limits if needed.

---

## Security Best Practices

1. **Never share API keys** in public repositories or messages
2. **Use environment variables** for storing keys
3. **Rotate keys regularly** (monthly recommended)
4. **Use HTTPS** only in production
5. **Monitor usage** for suspicious activity

---

## Getting Help

- **MCP Protocol**: https://modelcontextprotocol.io
- **Anthropic SDK**: https://docs.anthropic.com
- **Server Logs**: Check deployment guide for log access
- **Issues**: Report on GitHub repository

---

## Next Steps

1. ✅ Connect Claude Desktop to your MCP server
2. ✅ Test basic vessel tracking query
3. ✅ Try complex multi-tool analysis
4. ✅ Build custom integration for your workflow
5. 📊 Monitor usage and optimize queries

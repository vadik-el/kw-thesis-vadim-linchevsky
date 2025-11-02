# Vessel Tracking MCP Server

Transform your Vessel Tracking Agent into a remote service accessible via the Model Context Protocol (MCP).

## What is This?

This MCP server allows you to:
- 🌐 **Deploy remotely** on Digital Ocean or any cloud provider
- 🔌 **Connect from Claude Desktop** or any MCP-compatible client
- 🚢 **Access vessel tracking tools** from anywhere
- 🔐 **Secure with API keys** and JWT authentication
- 📊 **Scale for multiple users** with Docker + Nginx

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
# Copy template
cp .env.example .env

# Add your API keys
nano .env
```

Required variables:
```env
ANTHROPIC_API_KEY=sk-ant-...
TERMINAL49_API_KEY=...
MCP_API_KEYS=vt_your_api_key_here
```

### 3. Generate API Key

```bash
npm run generate:key
```

Copy the generated key to your `.env` file.

### 4. Run Locally (Development)

```bash
# Run in HTTP mode
MCP_TRANSPORT_MODE=http npm run mcp:dev

# Or use Docker
docker-compose up
```

### 5. Test Connection

```bash
# Health check
curl http://localhost:3000/health

# Test MCP endpoint
curl http://localhost:3000/mcp \
  -H "Authorization: Bearer vt_your_api_key"
```

## Deployment

### Docker Compose (Recommended)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f mcp-server

# Stop services
docker-compose down
```

### Digital Ocean

Full deployment guide: See [MCP_DEPLOYMENT_GUIDE.md](./MCP_DEPLOYMENT_GUIDE.md)

Summary:
1. Create Ubuntu 22.04 droplet ($12/mo)
2. Install Docker & Docker Compose
3. Clone repo and configure `.env`
4. Run `docker-compose up -d`
5. Configure SSL (Let's Encrypt or Load Balancer)
6. Connect from clients

## Connecting Clients

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vessel-tracking": {
      "url": "https://your-domain.com/mcp",
      "headers": {
        "Authorization": "Bearer vt_your_api_key"
      }
    }
  }
}
```

Restart Claude Desktop and start asking about vessels!

### Python

```python
from anthropic import Anthropic

client = Anthropic(api_key="your-key")
response = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=1024,
    mcp_servers=[{
        "url": "https://your-domain.com/mcp",
        "headers": {"Authorization": "Bearer vt_your_api_key"}
    }],
    messages=[{
        "role": "user",
        "content": "Track vessel MSKU123456"
    }]
)
```

Full client guide: See [MCP_CLIENT_GUIDE.md](./MCP_CLIENT_GUIDE.md)

## Available Tools

Once connected, Claude can use these tools:

| Tool | Description |
|------|-------------|
| `track_vessel` | Real-time vessel tracking via Terminal49 |
| `search_documents` | Semantic search across shipping documents |
| `query_trades` | Financial trading data queries |
| `get_dashboard` | Analytics dashboards |
| `analyze_risk` | Risk assessment and VaR calculations |
| `get_financial_summary` | P&L and financial reports |

## Architecture

```
┌─────────────────┐
│  MCP Clients    │  (Claude Desktop, Python, TypeScript)
│  (Anywhere)     │
└────────┬────────┘
         │ HTTPS + Bearer Auth
         ▼
┌─────────────────┐
│  Digital Ocean  │
│  Droplet        │
│  ┌───────────┐  │
│  │   Nginx   │  │ (SSL, Rate Limiting)
│  │  Reverse  │  │
│  │   Proxy   │  │
│  └─────┬─────┘  │
│        ▼        │
│  ┌───────────┐  │
│  │MCP Server │  │ (Express + SSE)
│  │ (Node.js) │  │
│  └─────┬─────┘  │
│        ▼        │
│  ┌───────────┐  │
│  │  Agent    │  │ (LangChain + Tools)
│  │Orchestr.  │  │
│  └─────┬─────┘  │
│        ▼        │
│  ┌───────────┐  │
│  │PostgreSQL │  │ (Data)
│  │  Qdrant   │  │ (Vectors)
│  └───────────┘  │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  External APIs  │  (Anthropic, Terminal49)
└─────────────────┘
```

## Security

### Authentication

Two methods supported:

1. **API Keys** (recommended for services):
```bash
Authorization: Bearer vt_abc123...
```

2. **JWT Tokens** (for user-based auth):
```bash
# Generate token
npm run generate:jwt user123 user@example.com

# Use in header
Authorization: Bearer eyJhbGc...
```

### Rate Limiting

- **Default**: 10 requests/second with burst of 20
- Configure in `nginx.conf`

### SSL/TLS

- Use Let's Encrypt for free SSL
- Or Digital Ocean Load Balancer
- Always use HTTPS in production

## Monitoring

### Health Check

```bash
curl https://your-domain.com/health
```

Response:
```json
{
  "status": "healthy",
  "server": "vessel-tracking-mcp"
}
```

### Logs

```bash
# Real-time logs
docker-compose logs -f mcp-server

# Search for errors
docker-compose logs mcp-server | grep ERROR

# Authentication failures
docker-compose logs mcp-server | grep "Authentication failed"
```

### Metrics

Built-in Winston logging tracks:
- Tool invocations
- Authentication attempts
- Error rates
- Response times

## Cost Estimate

### Digital Ocean

| Item | Monthly Cost |
|------|-------------|
| Basic Droplet (2 GB RAM) | $12 |
| Load Balancer (optional) | $12 |
| **Total** | **$12-24/mo** |

### API Costs

- **Anthropic**: ~$3-15 per 1M tokens (model dependent)
- **Terminal49**: Based on your API plan
- **Extended Thinking**: Additional tokens (~2-10x base cost)

## Development

### Project Structure

```
src/
├── mcp-server/
│   ├── index.ts              # Main MCP server
│   ├── middleware/
│   │   └── auth.ts           # Authentication
│   └── scripts/
│       └── generate-api-key.ts  # Key generation
├── services/
│   └── langchain/
│       ├── CloverReActAgent.ts  # Core agent
│       └── tools/               # All tools
└── utils/
    └── logger.ts             # Winston logging
```

### Scripts

```bash
npm run mcp:dev        # Development mode (watch)
npm run mcp:start      # Production mode
npm run build          # Compile TypeScript
npm run generate:key   # Generate API key
npm run generate:jwt   # Generate JWT token
```

### Environment Variables

See `.env.example` for all options. Key variables:

```env
# Transport
MCP_TRANSPORT_MODE=http    # or 'stdio' for local
MCP_PORT=3000

# Auth
MCP_API_KEYS=key1,key2,key3  # Comma-separated
MCP_JWT_SECRET=your_secret
MCP_SKIP_AUTH=false         # NEVER true in production!

# APIs
ANTHROPIC_API_KEY=sk-ant-...
TERMINAL49_API_KEY=...

# Database (optional)
DATABASE_URL=postgresql://...
QDRANT_URL=http://qdrant:6333
```

## Troubleshooting

### Server won't start

```bash
# Check logs
docker-compose logs mcp-server

# Verify environment
cat .env | grep ANTHROPIC_API_KEY

# Check port availability
lsof -i :3000
```

### Authentication fails

```bash
# Test API key
curl http://localhost:3000/mcp \
  -H "Authorization: Bearer $(grep MCP_API_KEYS .env | cut -d'=' -f2 | cut -d',' -f1)"
```

### Can't connect from client

```bash
# Test connectivity
curl https://your-domain.com/health

# Check firewall
sudo ufw status

# Verify DNS
dig your-domain.com
```

## Documentation

- **[MCP_DEPLOYMENT_GUIDE.md](./MCP_DEPLOYMENT_GUIDE.md)** - Complete Digital Ocean deployment
- **[MCP_CLIENT_GUIDE.md](./MCP_CLIENT_GUIDE.md)** - Client connection examples
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Agent architecture details
- **[README.md](./README.md)** - Main project documentation

## Support

- **MCP Protocol**: https://modelcontextprotocol.io
- **Anthropic**: https://docs.anthropic.com
- **Issues**: Open on GitHub repository

## License

MIT License - Use freely in your projects!

---

**Ready to deploy?** Start with [MCP_DEPLOYMENT_GUIDE.md](./MCP_DEPLOYMENT_GUIDE.md)

**Need help connecting?** See [MCP_CLIENT_GUIDE.md](./MCP_CLIENT_GUIDE.md)

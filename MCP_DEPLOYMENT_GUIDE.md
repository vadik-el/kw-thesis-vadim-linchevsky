# MCP Server Deployment Guide - Digital Ocean

Complete guide to deploying the Vessel Tracking MCP Server on Digital Ocean for remote access via the Model Context Protocol.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start (Docker)](#quick-start-docker)
3. [Digital Ocean Droplet Setup](#digital-ocean-droplet-setup)
4. [Production Deployment](#production-deployment)
5. [Client Connection](#client-connection)
6. [Security Best Practices](#security-best-practices)
7. [Monitoring & Maintenance](#monitoring--maintenance)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Digital Ocean Account** with payment method configured
- **Domain name** (optional but recommended for SSL)
- **API Keys**:
  - Anthropic API key (for Claude)
  - Terminal49 API key (for vessel tracking)
- **Local Tools**:
  - SSH client
  - Git
  - Docker (for local testing)

---

## Quick Start (Docker)

Test the MCP server locally before deploying:

### 1. Clone and Configure

```bash
# Clone the repository
git clone <your-repo-url>
cd kw-thesis-vadim-linchevsky

# Copy environment template
cp .env.example .env

# Edit .env and add your API keys
nano .env
```

### 2. Generate Authentication Keys

```bash
# Install dependencies
npm install

# Generate an API key
npm run generate:key
# Add the generated key to .env: MCP_API_KEYS="vt_..."

# Or generate JWT token
npm run generate:jwt myuser user@example.com
```

### 3. Run with Docker Compose

```bash
# Start all services
docker-compose up -d

# Check logs
docker-compose logs -f mcp-server

# Test health endpoint
curl http://localhost:3000/health
```

### 4. Test Locally

```bash
# Test with curl (replace YOUR_API_KEY)
curl -X GET http://localhost:3000/mcp \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## Digital Ocean Droplet Setup

### Step 1: Create Droplet

1. **Log in to Digital Ocean** → Click "Create" → "Droplets"

2. **Choose Configuration**:
   - **Image**: Ubuntu 22.04 LTS
   - **Plan**: Basic ($12/mo - 2 GB RAM, 1 vCPU, 50 GB SSD)
     - For production: $24/mo - 4 GB RAM, 2 vCPUs recommended
   - **Datacenter**: Choose closest to your users
   - **Authentication**: SSH key (recommended) or password
   - **Hostname**: `vessel-tracking-mcp`

3. **Click "Create Droplet"** - Wait ~60 seconds

### Step 2: Initial Server Setup

```bash
# SSH into your droplet (replace YOUR_DROPLET_IP)
ssh root@YOUR_DROPLET_IP

# Update system
apt update && apt upgrade -y

# Create non-root user
adduser mcp
usermod -aG sudo mcp

# Setup firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Switch to new user
su - mcp
```

### Step 3: Install Docker & Docker Compose

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installation
docker --version
docker-compose --version

# Log out and back in for group changes to take effect
exit
su - mcp
```

### Step 4: Clone and Configure Application

```bash
# Install Git
sudo apt install -y git

# Clone repository
cd ~
git clone <your-repo-url>
cd kw-thesis-vadim-linchevsky

# Create .env file
cp .env.example .env
nano .env
```

**Configure these critical variables in `.env`**:

```bash
# API Keys (REQUIRED)
ANTHROPIC_API_KEY=sk-ant-...
TERMINAL49_API_KEY=...

# MCP Server
MCP_TRANSPORT_MODE=http
MCP_PORT=3000
MCP_SKIP_AUTH=false

# Generate strong keys for production
MCP_API_KEYS=vt_YOUR_GENERATED_KEY_HERE
MCP_JWT_SECRET=CHANGE_THIS_LONG_RANDOM_STRING

# Database
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/vessel_tracking

# Logging
NODE_ENV=production
LOG_LEVEL=info
```

### Step 5: Deploy Application

```bash
# Build and start services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f mcp-server

# Test locally
curl http://localhost:3000/health
```

---

## Production Deployment

### SSL Certificate Setup (Recommended)

#### Option 1: Let's Encrypt (Free)

```bash
# Install Certbot
sudo apt install -y certbot

# Stop Nginx temporarily
docker-compose stop nginx

# Get certificate (replace YOUR_DOMAIN)
sudo certbot certonly --standalone -d your-domain.com -d www.your-domain.com

# Certificates saved to: /etc/letsencrypt/live/your-domain.com/

# Update docker-compose.yml to mount certificates
nano docker-compose.yml

# Add to nginx service volumes:
# - /etc/letsencrypt:/etc/letsencrypt:ro

# Update nginx.conf for SSL
nano nginx.conf
# Uncomment HTTPS server block and update server_name

# Restart services
docker-compose up -d
```

#### Option 2: Digital Ocean Load Balancer (Easier)

1. **Create Load Balancer** in Digital Ocean dashboard
2. **Add SSL certificate** (Let's Encrypt or upload your own)
3. **Configure forwarding**:
   - HTTPS (443) → HTTP (80) to your droplet
4. **Update health check**: Path = `/health`
5. **Point your domain** to load balancer IP

### Environment Variables for Production

Create a secure `.env` file:

```bash
# Generate secure secrets
openssl rand -hex 32  # For MCP_JWT_SECRET
npm run generate:key  # For MCP_API_KEYS

# Use these in production .env
```

### Docker Compose Production Tweaks

```yaml
# docker-compose.yml modifications for production
services:
  mcp-server:
    restart: always
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 2G
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

---

## Client Connection

### From Claude Desktop

Create/edit `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "vessel-tracking": {
      "url": "https://your-domain.com/mcp",
      "headers": {
        "Authorization": "Bearer vt_your_api_key_here"
      }
    }
  }
}
```

Restart Claude Desktop. You should see vessel tracking tools available.

### From Python

```python
from anthropic import Anthropic

client = Anthropic(api_key="your-anthropic-key")

# Configure MCP connection
response = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=1024,
    mcp_servers=[{
        "url": "https://your-domain.com/mcp",
        "headers": {
            "Authorization": "Bearer vt_your_api_key_here"
        }
    }],
    messages=[{
        "role": "user",
        "content": "Track vessel with B/L number MSKU123456"
    }]
)
```

### From TypeScript

```typescript
import { Anthropic } from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const response = await client.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 1024,
  mcpServers: [{
    url: 'https://your-domain.com/mcp',
    headers: {
      'Authorization': 'Bearer vt_your_api_key_here',
    },
  }],
  messages: [{
    role: 'user',
    content: 'What vessels are currently tracked?',
  }],
});
```

### Testing Connection

```bash
# Test health endpoint
curl https://your-domain.com/health

# Test MCP endpoint with authentication
curl -X GET https://your-domain.com/mcp \
  -H "Authorization: Bearer vt_your_api_key_here" \
  -H "Accept: text/event-stream"

# Should return SSE stream
```

---

## Security Best Practices

### 1. API Key Management

```bash
# Rotate keys regularly
npm run generate:key

# Update .env with new key
nano .env

# Restart services
docker-compose restart mcp-server

# Revoke old keys (remove from MCP_API_KEYS)
```

### 2. Firewall Configuration

```bash
# Only allow necessary ports
sudo ufw status
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw deny 3000/tcp  # Block direct access to MCP port
```

### 3. Monitoring Failed Auth Attempts

```bash
# Check logs for authentication failures
docker-compose logs mcp-server | grep "Authentication failed"

# Set up alerts for repeated failures (optional)
```

### 4. Rate Limiting

The nginx.conf includes rate limiting (10 req/s with burst of 20). Adjust if needed:

```nginx
limit_req_zone $binary_remote_addr zone=mcp_limit:10m rate=10r/s;
```

### 5. Database Security

```bash
# Change default PostgreSQL password
nano docker-compose.yml
# Update POSTGRES_PASSWORD

# Restrict database access
# Edit docker-compose.yml and remove ports exposure for postgres/qdrant
```

---

## Monitoring & Maintenance

### Daily Health Checks

```bash
# Automated health check script
cat > /home/mcp/health-check.sh << 'EOF'
#!/bin/bash
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health)
if [ $STATUS -ne 200 ]; then
  echo "MCP Server unhealthy (HTTP $STATUS)" | mail -s "MCP Alert" you@example.com
  docker-compose restart mcp-server
fi
EOF

chmod +x /home/mcp/health-check.sh

# Add to crontab (every 5 minutes)
crontab -e
# Add: */5 * * * * /home/mcp/health-check.sh
```

### Logs Management

```bash
# View real-time logs
docker-compose logs -f mcp-server

# View last 100 lines
docker-compose logs --tail=100 mcp-server

# Search logs for errors
docker-compose logs mcp-server | grep ERROR

# Export logs
docker-compose logs --no-color mcp-server > mcp-logs-$(date +%Y%m%d).txt
```

### Backup Strategy

```bash
# Backup script
cat > /home/mcp/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR=/home/mcp/backups
mkdir -p $BACKUP_DIR
DATE=$(date +%Y%m%d_%H%M%S)

# Backup PostgreSQL
docker exec kw-thesis-vadim-linchevsky_postgres_1 \
  pg_dump -U postgres vessel_tracking | gzip > $BACKUP_DIR/postgres_$DATE.sql.gz

# Backup .env file
cp /home/mcp/kw-thesis-vadim-linchevsky/.env $BACKUP_DIR/env_$DATE

# Clean old backups (keep 7 days)
find $BACKUP_DIR -mtime +7 -delete
EOF

chmod +x /home/mcp/backup.sh

# Schedule daily backups at 2 AM
crontab -e
# Add: 0 2 * * * /home/mcp/backup.sh
```

### Updates & Upgrades

```bash
# Update application
cd ~/kw-thesis-vadim-linchevsky
git pull
docker-compose down
docker-compose up -d --build

# Update system packages
sudo apt update && sudo apt upgrade -y

# Update Docker images
docker-compose pull
docker-compose up -d
```

---

## Troubleshooting

### Issue: MCP Server Won't Start

```bash
# Check logs
docker-compose logs mcp-server

# Common fixes:
# 1. Port already in use
sudo lsof -i :3000
sudo kill -9 <PID>

# 2. Missing environment variables
cat .env | grep ANTHROPIC_API_KEY

# 3. Docker out of disk space
docker system prune -a
```

### Issue: Authentication Fails

```bash
# Verify API key in .env
cat .env | grep MCP_API_KEYS

# Test with correct key
curl -X GET http://localhost:3000/mcp \
  -H "Authorization: Bearer $(grep MCP_API_KEYS .env | cut -d'=' -f2)"
```

### Issue: Can't Connect from Client

```bash
# Check firewall
sudo ufw status

# Check if port is accessible
nc -zv YOUR_DROPLET_IP 443

# Check nginx logs
docker-compose logs nginx

# Verify DNS (if using domain)
dig your-domain.com
nslookup your-domain.com
```

### Issue: High Memory Usage

```bash
# Check container stats
docker stats

# Restart if needed
docker-compose restart mcp-server

# Set memory limits in docker-compose.yml
```

### Issue: SSL Certificate Expired

```bash
# Renew Let's Encrypt certificate
sudo certbot renew

# Restart nginx
docker-compose restart nginx
```

---

## Cost Estimate (Digital Ocean)

| Resource | Monthly Cost |
|----------|-------------|
| Droplet (2 GB RAM) | $12 |
| Load Balancer (optional) | $12 |
| Backups (optional) | $2.40 |
| Monitoring (optional) | $0 (free tier) |
| **Total (without LB)** | **$12-14/mo** |
| **Total (with LB + SSL)** | **$24-28/mo** |

Plus external API costs:
- Anthropic API: Pay per token
- Terminal49 API: Based on your plan

---

## Next Steps

1. ✅ Deploy MCP server on Digital Ocean
2. ✅ Configure SSL with Let's Encrypt or Load Balancer
3. ✅ Generate secure API keys
4. ✅ Connect from Claude Desktop
5. ✅ Test vessel tracking functionality
6. 📊 Set up monitoring and alerts
7. 🔄 Schedule automated backups
8. 📈 Monitor usage and optimize costs

---

## Support & Resources

- **MCP Protocol Docs**: https://modelcontextprotocol.io
- **Digital Ocean Docs**: https://docs.digitalocean.com
- **Anthropic API Docs**: https://docs.anthropic.com
- **Terminal49 API**: https://docs.terminal49.com

## License

MIT License - See LICENSE file

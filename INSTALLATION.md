# Installation & Deployment

This guide covers installing mcp-context-proxy (MCPCP) and running it as a persistent service.

## Prerequisites

- **Node.js 24+** (required)
- **npm** or **npx**

### Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@modelcontextprotocol/sdk` | 1.25.x | MCP protocol implementation |
| `ai` / `@ai-sdk/openai-compatible` | 6.x / 2.x | LLM API client (Vercel AI SDK) |
| `ai-tokenizer` | 1.x | Token counting (o200k_base encoding) |
| `express` | 5.x | HTTP server for SSE/Streamable HTTP transports |
| `zod` | 4.x | Configuration schema validation |
| `winston` | 3.x | Logging |

## Installation

### Global Install (Recommended)

```bash
npm install -g mcp-context-proxy
```

### Local Install

```bash
npm install mcp-context-proxy
```

### No Install (npx)

```bash
npx mcp-context-proxy --help
```

## Quick Start

1. Generate a config file:

```bash
mcp-context-proxy --init
```

2. Edit `mcpcp.config.json` with your upstream servers and compression model. See the [README](./README.md#configuration) for full configuration options.

3. Run the proxy:

```bash
mcp-context-proxy
```

---

## Running as a Service

For persistent deployments, you have two main options: **PM2** (cross-platform) or **Docker**.

### Option A: PM2 (Cross-platform)

[PM2](https://pm2.keymetrics.io/) is a production process manager for Node.js with built-in load balancing, monitoring, and auto-restart.

#### 1. Install PM2

```bash
npm install -g pm2
```

#### 2. Create Ecosystem File

Create `ecosystem.config.js` in your project directory:

```javascript
module.exports = {
  apps: [{
    name: 'mcpcp',
    script: 'mcp-context-proxy',
    args: '-c /path/to/mcpcp.config.json',
    watch: false,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 1000,
    env: {
      NODE_ENV: 'production'
    }
  }]
}
```

Or, if using npx without global install:

```javascript
module.exports = {
  apps: [{
    name: 'mcpcp',
    script: 'npx',
    args: 'mcp-context-proxy -c /path/to/mcpcp.config.json',
    interpreter: 'none',
    watch: false,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 1000
  }]
}
```

#### 3. Start the Service

```bash
pm2 start ecosystem.config.js
```

#### 4. Common PM2 Commands

| Command | Description |
|---------|-------------|
| `pm2 start mcpcp` | Start the proxy |
| `pm2 stop mcpcp` | Stop the proxy |
| `pm2 restart mcpcp` | Restart the proxy |
| `pm2 logs mcpcp` | View logs |
| `pm2 logs mcpcp --lines 100` | View last 100 log lines |
| `pm2 monit` | Real-time monitoring dashboard |
| `pm2 status` | Show all running processes |

#### 5. Auto-start on Boot

```bash
pm2 startup
pm2 save
```

Follow the instructions printed by `pm2 startup` to configure your system's init system.

#### 6. Log Management

PM2 stores logs in `~/.pm2/logs/`. Configure log rotation:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

---

### Option B: Docker

Docker provides isolated, reproducible deployments. The included Dockerfile uses a multi-stage build with a non-root user for security.

#### Prerequisites

- Docker 20.10+
- Docker Compose v2 (optional, but recommended)

#### Transport Limitation

> **Important:** Docker deployments only support HTTP-based transports (`sse`, `streamable-http`) for upstream MCP servers.
>
> Stdio-based upstreams (e.g., `command: "npx"`) cannot run inside the container. For stdio servers, consider:
> - Running MCPCP directly on the host with PM2
> - Using [mcp-proxy](https://github.com/punkpeye/mcp-proxy) to expose stdio MCP servers over HTTP, then connect to them from Docker

Your config must use HTTP transports for upstreams when running in Docker:

```json
{
  "upstreams": [
    {
      "id": "my-server",
      "name": "My MCP Server",
      "transport": "streamable-http",
      "url": "http://host.docker.internal:8081/mcp"
    }
  ]
}
```

#### 1. Build the Image

```bash
docker build -t mcpcp .
```

#### 2. Prepare Configuration

Create your `mcpcp.config.json` with HTTP transport for downstream:

```json
{
  "downstream": {
    "transport": "streamable-http",
    "port": 3000,
    "host": "0.0.0.0"
  },
  "upstreams": [...],
  "compression": {...}
}
```

#### 3. Run with Docker

```bash
docker run -d \
  --name mcpcp \
  -p 3000:3000 \
  -v $(pwd)/mcpcp.config.json:/app/mcpcp.config.json:ro \
  --restart unless-stopped \
  mcpcp --config /app/mcpcp.config.json
```

#### 4. Run with Docker Compose (Recommended)

The included `docker-compose.yml`:

```yaml
services:
  mcp-context-proxy:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./mcpcp.config.json:/app/mcpcp.config.json:ro
    command: ["node", "dist/cli.js", "--config", "/app/mcpcp.config.json"]
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 3s
      retries: 3
```

Start the service:

```bash
docker compose up -d
```

#### 5. Common Docker Commands

| Command | Description |
|---------|-------------|
| `docker compose up -d` | Start in background |
| `docker compose down` | Stop and remove container |
| `docker compose logs -f` | Follow logs |
| `docker compose restart` | Restart the service |
| `docker compose build --no-cache` | Rebuild image |

#### 6. Health Check

The container includes a health check that polls `/health` every 30 seconds:

```bash
docker inspect --format='{{.State.Health.Status}}' mcpcp
```

---

## Verifying the Installation

### Health Check Endpoint

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{"status":"ok"}
```

### Web Dashboard

Access the dashboard at `http://localhost:3000/` (only available with HTTP transports).

The dashboard provides:
- **Configuration** - Edit config and hot-reload
- **Logs** - Real-time log streaming
- **Status** - Upstream connection status

### Test Tool Call

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq
```

---

## Troubleshooting

### Port Already in Use

```
Error: listen EADDRINUSE: address already in use :::3000
```

Either change the port in your config, or find and stop the process using port 3000:

```bash
lsof -i :3000
kill <PID>
```

### Upstream Connection Failures

Check the logs for connection errors:

```bash
# PM2
pm2 logs mcpcp

# Docker
docker compose logs -f
```

Common causes:
- Upstream server not running
- Incorrect URL or transport type
- Network/firewall blocking the connection

### Configuration Errors

Validate your config before starting:

```bash
mcp-context-proxy --config mcpcp.config.json
```

The proxy validates configuration on startup and logs specific errors for invalid fields.

### Compression Model Unreachable

If the compression LLM is unreachable, responses will be returned uncompressed. Check:
- `compression.baseUrl` is correct
- The LLM server is running and accessible
- API key is valid (if required)

### Docker: Cannot Connect to Host Services

When the compression model or upstream MCP servers run on the host:

- **Linux**: Use `host.docker.internal` (requires `--add-host=host.docker.internal:host-gateway`)
- **macOS/Windows**: `host.docker.internal` works automatically

Example for Linux docker-compose:

```yaml
services:
  mcp-context-proxy:
    # ... other config ...
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

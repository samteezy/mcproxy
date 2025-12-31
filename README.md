# MCPith

A transparent MCP (Model Context Protocol) proxy that compresses large tool responses using an external LLM before passing them to resource-constrained local models.

## Why MCPith?

When running local LLMs on limited VRAM, large context windows from MCP tool responses can overwhelm your model. MCPith sits between your MCP client and upstream MCP servers, automatically compressing responses that exceed a token threshold.

```
MCP Client (Claude Desktop, Cursor, etc.)
    ↓
MCPith Proxy
    ↓ ←── Compression Model (OpenAI-compatible)
Upstream MCP Server(s)
```

## Features

- **Transparent proxy** - Works with any MCP client and server
- **Smart compression** - Auto-detects content type (JSON, code, text) and applies appropriate compression strategy
- **Per-tool policies** - Configure different compression thresholds for different tools
- **Token-based threshold** - Only compresses responses exceeding configurable token count
- **Multi-server aggregation** - Connect to multiple upstream MCP servers simultaneously
- **All transports** - Supports stdio, SSE, and Streamable HTTP for both upstream and downstream
- **In-memory caching** - Reduces repeated compressions with TTL-based cache

## Installation

```bash
npm install
npm run build
```

## Quick Start

1. Generate a config file:
```bash
node dist/cli.js --init
```

2. Edit `mcpith.config.json` to configure your upstream servers and compression model:
```json
{
  "downstream": {
    "transport": "stdio"
  },
  "upstreams": [
    {
      "id": "my-server",
      "name": "My MCP Server",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    }
  ],
  "compression": {
    "baseUrl": "http://localhost:8080/v1",
    "model": "your-model",
    "defaultPolicy": {
      "enabled": true,
      "tokenThreshold": 1000,
      "maxOutputTokens": 500
    }
  }
}
```

3. Run the proxy:
```bash
node dist/cli.js
```

## Configuration

### Downstream (Client-facing)

| Field | Type | Description |
|-------|------|-------------|
| `transport` | `"stdio" \| "sse" \| "streamable-http"` | Transport protocol |
| `port` | `number` | Port for HTTP transports |
| `host` | `string` | Host to bind for HTTP transports |

### Upstreams (MCP Servers)

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier (used for tool namespacing) |
| `name` | `string` | Human-readable name |
| `transport` | `"stdio" \| "sse" \| "streamable-http"` | Transport protocol |
| `command` | `string` | Command to run (stdio only) |
| `args` | `string[]` | Command arguments (stdio only) |
| `url` | `string` | Server URL (HTTP transports) |
| `enabled` | `boolean` | Enable/disable this upstream |

### Compression

| Field | Type | Description |
|-------|------|-------------|
| `baseUrl` | `string` | OpenAI-compatible API base URL |
| `apiKey` | `string` | API key (optional for local models) |
| `model` | `string` | Model identifier |
| `defaultPolicy` | `object` | Default compression policy for all tools |
| `toolPolicies` | `object` | Per-tool policy overrides (keyed by namespaced tool name) |

#### Default Policy

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | `boolean` | Enable/disable compression globally (default: true) |
| `tokenThreshold` | `number` | Minimum tokens to trigger compression (default: 1000) |
| `maxOutputTokens` | `number` | Maximum tokens in compressed output |

#### Per-Tool Policies

You can override the default policy for specific tools:

```json
{
  "compression": {
    "baseUrl": "http://localhost:8080/v1",
    "model": "your-model",
    "defaultPolicy": {
      "enabled": true,
      "tokenThreshold": 1000
    },
    "toolPolicies": {
      "my-server__read_file": {
        "enabled": false
      },
      "my-server__search": {
        "tokenThreshold": 200,
        "maxOutputTokens": 100
      }
    }
  }
}
```

Each tool policy can override any of: `enabled`, `tokenThreshold`, `maxOutputTokens`

### Cache

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | `boolean` | Enable/disable caching |
| `ttlSeconds` | `number` | Cache entry TTL |
| `maxEntries` | `number` | Maximum cache entries |

## Tool Namespacing

Tools from upstream servers are namespaced to avoid conflicts:
- Original tool: `read_file`
- Namespaced: `{upstream_id}__read_file`

## Compression Strategies

MCPith auto-detects content type and applies the appropriate strategy:

| Strategy | Trigger | Behavior |
|----------|---------|----------|
| `code` | Function definitions, imports, class syntax | Preserves signatures, summarizes implementation |
| `json` | Valid JSON | Preserves structure, shortens values |
| `default` | Everything else | General text compression |

## Development

```bash
npm run dev          # Development mode with hot reload
npm run build        # Production build
npm run typecheck    # Type checking
npm run lint         # Linting
npm run test         # Run tests
```

## License

MIT

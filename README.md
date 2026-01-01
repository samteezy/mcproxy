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
- **Tool hiding** - Hide unwanted tools to reduce context pollution and improve model focus
- **PII masking** - Mask sensitive data (emails, SSNs, phone numbers, etc.) before sending to upstream servers
- **Smart compression** - Auto-detects content type (JSON, code, text) and applies appropriate compression strategy
- **Per-tool policies** - Configure different compression thresholds and masking rules for different tools
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

### Tools

Configure tool visibility to reduce context pollution:

| Field | Type | Description |
|-------|------|-------------|
| `hidden` | `string[]` | Tool patterns to hide from clients |

#### Hiding Tools

Many MCP servers expose tools you may not want cluttering your context. Hide them:

```json
{
  "tools": {
    "hidden": [
      "github__*",
      "server__dangerous_tool",
      "*__internal_*"
    ]
  }
}
```

Patterns support `*` as wildcard:
- `"github__*"` - Hide all tools from the `github` upstream
- `"*__execute"` - Hide any tool named `execute` from any upstream
- `"server__debug_*"` - Hide tools starting with `debug_` from `server`

Hidden tools are:
- Not listed in `tools/list` responses
- Rejected if called directly (returns "tool not found")

### PII Masking

Protect sensitive data from being sent to upstream MCP servers. PII is masked before forwarding to upstreams and restored before returning to the client.

```
Client sends:    email=alice@example.com
        ↓
    [MASK]       email=[EMAIL_1]  (upstream never sees original)
        ↓
    Upstream     processes masked data
        ↓
   [RESTORE]     email=alice@example.com
        ↓
Client receives: original values restored
```

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | `boolean` | Enable/disable PII masking globally (default: false) |
| `defaultPolicy` | `object` | Default masking policy for all tools |
| `toolPolicies` | `object` | Per-tool policy overrides |
| `llmConfig` | `object` | Optional LLM config for fallback detection |

#### Masking Policy

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | `boolean` | Enable/disable masking for this tool |
| `piiTypes` | `string[]` | PII types to mask (see below) |
| `llmFallback` | `boolean` | Use LLM for ambiguous cases |
| `llmFallbackThreshold` | `number` | Confidence threshold (0-1) to trigger LLM |
| `customPatterns` | `object` | Custom regex patterns |

#### Supported PII Types

| Type | Placeholder | Example |
|------|-------------|---------|
| `email` | `[EMAIL_1]` | `user@example.com` |
| `ssn` | `[SSN_1]` | `123-45-6789` |
| `phone` | `[PHONE_1]` | `555-123-4567` |
| `credit_card` | `[CREDIT_CARD_1]` | `4111111111111111` |
| `ip_address` | `[IP_1]` | `192.168.1.100` |
| `date_of_birth` | `[DOB_1]` | `01/15/1990` |
| `passport` | `[PASSPORT_1]` | `A12345678` |
| `driver_license` | `[DL_1]` | `D1234567` |

#### Example Configuration

```json
{
  "masking": {
    "enabled": true,
    "defaultPolicy": {
      "enabled": true,
      "piiTypes": ["email", "ssn", "phone", "credit_card", "ip_address"],
      "llmFallback": false,
      "llmFallbackThreshold": 0.7
    },
    "toolPolicies": {
      "my-server__internal_tool": {
        "enabled": false
      },
      "database__query": {
        "llmFallback": true,
        "customPatterns": {
          "employee_id": {
            "regex": "EMP[0-9]{6}",
            "replacement": "[EMPLOYEE_ID_REDACTED]"
          }
        }
      }
    },
    "llmConfig": {
      "baseUrl": "http://localhost:8080/v1",
      "model": "your-model"
    }
  }
}
```

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

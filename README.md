# mcproxy

**mcproxy Lightens Inference Processing**

A transparent MCP (Model Context Protocol) proxy that compresses large tool responses using an external LLM before passing them to resource-constrained local models.

> **This project is meant for personal use, and no guarantees are made for mission critical production environments... or whatever your environment is. Yeah, it's vibe coded. Trust it as much as you'd trust any other random code you find on the web.**

## Why mcproxy?

For those of us running LLMs locally, especially at home, context costs us time, not just tokens. This project was borne out of frustration with MCPs that are little more than "API wrappers" and would respond with often much more information than I needed, eating up valuable context and taking up time while I waited for the prompt processing to complete.

I wanted to see how a tiny LLM/SLM could help compress MCP outputs before responding back to the client LLM. That worked, and then I started adding in more functionality to make this a helpful little Swiss Army Knife for enthusiasts like myself... but like a really tiny Swiss Army Knife, not one of those obscene behemoths.

## How do I use mcproxy?

Let's say you're running Llama.cpp locally with something like `gpt-oss-120b`. You have the usual `fetch` and maybe `searxng` MCPs set up doing some basic web search and URL retrieval. But processing those pages is taking forever and adding useless context. So you allocate a little VRAM, or even regular RAM, to `Qwen3-0.6B` or `LFM2-1.2B` and set up mcproxy as the proxy for those MCPs. Now if the token count passes a certain threshold, your small model performs an extraction/summary against the content and returns *that* back to your larger model, saving time.

I realized that an alternative to running a small LLM locally could also be "offshoring" compression of certain MCP responses to zero-cost or low cost cloud models. Perhaps you want to do as much as you can locally, but don't mind having a cloud model read public web pages that searxng finds. You could have you local model hand that off to a cloud model to compress and then give you back what you need to know from that page, without compromising privacy. To that end, I'm also experimenting with adding some PII-preserving functions with combinations of regex and LLM.

Maybe you're not using `sammcj/mcp-devtools` (you should) or there's a MCP that helps solve a very specific need, but you don't need most of the tools it offers. So every time your LLM runs, you're burning initial tokens with those extra tool references. Rather than reinventing the upstream MCP, you can use mcproxy to disable those tools, so your client LLM never sees them in the first place, increasing performance and saving time.
```
MCP Client (Claude Desktop, Cursor, etc.)
    ↓
mcproxy Proxy
    ↓ ←── Compression Model (OpenAI-compatible)
Upstream MCP Server(s)
```

## Features

- **Transparent proxy** - Works with any MCP client and server
- **Smart compression** - Auto-detects content type (JSON, code, text) and applies appropriate compression strategy, with per-tool configurability
- **In-memory caching** - Reduces repeated compressions with TTL-based cache
- **Tool hiding** - Hide unwanted tools to reduce context pollution and improve model focus
- **Description overrides** - Customize tool descriptions to better steer client LLM behavior
- **PII masking** - Mask sensitive data (emails, SSNs, phone numbers, etc.) before sending to upstream servers
- **Multi-server aggregation** - Connect to multiple upstream MCP servers simultaneously
- **All transports** - Supports stdio, SSE, and Streamable HTTP for both upstream and downstream
- **Per-tool policies** - Configure different compression thresholds and masking rules for different tools

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

2. Edit `mcproxy.config.json` to configure your upstream servers and compression model:
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
        "maxOutputTokens": 100,
        "customInstructions": "Focus on error messages and stack traces. Preserve file paths."
      }
    }
  }
}
```

Each tool policy can override any of: `enabled`, `tokenThreshold`, `maxOutputTokens`, `customInstructions`

#### Custom Instructions

The `customInstructions` field lets you guide the compression LLM for specific tools:

```json
"toolPolicies": {
  "fetch__fetch": {
    "customInstructions": "Preserve all URLs, dates, and code examples verbatim."
  },
  "database__query": {
    "customInstructions": "Focus on row counts and error messages. Omit raw data rows."
  }
}
```

These instructions are appended to the compression prompt, allowing you to customize what information is preserved or omitted for each tool.

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

#### Overriding Tool Descriptions

You can override tool descriptions to better guide client LLM behavior without modifying prompts:

```json
{
  "upstreams": [
    {
      "id": "fetch",
      "name": "Fetch",
      "transport": "stdio",
      "command": "uvx",
      "args": ["mcp-server-fetch"],
      "tools": {
        "fetch": {
          "overwriteDescription": "Fetches the contents of a URL. Use this only when the user has provided a specific URL in their message."
        }
      }
    }
  ]
}
```

The override completely replaces the upstream tool's description. If goal-aware compression is enabled, the `_mcproxy_goal` instruction is appended to your custom description.

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
| `llmFallbackThreshold` | `"low" \| "medium" \| "high"` | Trigger LLM for patterns at or below this confidence |
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
      "llmFallbackThreshold": "low"
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

mcproxy auto-detects content type and applies the appropriate strategy:

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

## Requirements

- Node.js 20+
- TypeScript 5.x

### Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@modelcontextprotocol/sdk` | 1.25.x | MCP protocol implementation |
| `ai` / `@ai-sdk/openai-compatible` | 6.x / 2.x | LLM API client (Vercel AI SDK) |
| `ai-tokenizer` | 1.x | Token counting (o200k_base encoding) |
| `express` | 5.x | HTTP server for SSE/Streamable HTTP transports |
| `zod` | 4.x | Configuration schema validation |
| `winston` | 3.x | Logging |

## License

MIT
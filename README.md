# mcp-context-proxy

**MCP Context Proxy (MCPCP)**

A transparent MCP (Model Context Protocol) proxy that compresses large tool responses using an external LLM before passing them to resource-constrained local models.

> **This project is meant for personal use, and no guarantees are made for mission critical production environments... or whatever your environment is. Yeah, it's vibe coded. Trust it as much as you'd trust any other random code you find on the web.**

## TL;DR: It's faster

- Use smaller models to summarize/extract content from any MCP response, saving time and context with your main model. **Stop trying to engineer around bloated MCP responses and get your agent the data it needs.**
- Uses caching for repeated, identical tool calls to save even more time and reduce API calls
- Tweak MCPs to your liking - disable tools, overwrite descriptions for better accuracy and SMALLER CONTEXT (see the theme yet?)
- A single configuration of all your upstream MCPs, so you can try different interfaces/coding agents without needing to setup all your MCPs each time
- Future looking - pre- and post- hooks to strip PII or check for prompt injection

## Where'd this come from?

For those of us running LLMs locally, especially at home, context costs us time, not just tokens. This project was borne out of frustration with MCPs that are little more than "API wrappers" and would respond with often much more information than I needed, eating up valuable context and taking up time while I waited for the prompt processing to complete.

I wanted to see how a tiny LLM/SLM could help compress MCP outputs before responding back to the client LLM. That worked, and then I started adding in more functionality to make this a helpful little Swiss Army Knife for enthusiasts like myself... but like a really tiny Swiss Army Knife, not one of those obscene behemoths.

## Ok, so how do I use it?

Let's say you're running Llama.cpp locally with something like `gpt-oss-120b`. You have the usual `fetch` and maybe `searxng` MCPs set up doing some basic web search and URL retrieval. But processing those pages is taking forever and adding useless context. So you allocate a little VRAM, or even regular RAM, to `Qwen3-0.6B` or `LFM2-1.2B` and set up MCPCP for your MCPs. Now if the response size exceeds a configured token count, your small model performs an extraction/summary against the content and returns *that* back to your larger model, saving time.

I realized that an alternative to running a small LLM locally could also be "offshoring" compression of certain MCP responses to zero-cost or low cost cloud models. Perhaps you want to do as much as you can locally, but don't mind having a cloud model read public web pages that searxng finds. You could have you local model hand that off to a cloud model to compress and then give you back what you need to know from that page, without compromising privacy. To that end, I'm also experimenting with adding some PII-preserving functions with combinations of regex and LLM.

Maybe you're not using `sammcj/mcp-devtools` (you should) or there's a MCP that helps solve a very specific need, but you don't need most of the tools it offers. So every time your LLM runs, you're burning initial tokens with those extra tool references. Rather than reinventing the upstream MCP, you can use mcp-context-proxy to disable those tools, so your client LLM never sees them in the first place, increasing performance and saving time.
```
MCP Client (Claude Desktop, Cursor, etc.)
    ↓
mcp-context-proxy
    ↓ ←── Compression Model (OpenAI-compatible)
Upstream MCP Server(s)
```

## Features

- **Transparent proxy** - Works with any MCP client and server
- **Smart compression** - Auto-detects content type (JSON, code, text) and applies appropriate compression strategy, with per-tool configurability
- **Response caching** - Caches compressed responses to avoid redundant LLM calls (near-instant response time on cache hits)
- **Tool hiding** - Hide unwanted tools to reduce context pollution and improve model focus
- **Description overrides** - Customize tool descriptions to better steer client LLM behavior
- **PII masking** - Mask sensitive data (emails, SSNs, phone numbers, etc.) before sending to upstream servers
- **Multi-server aggregation** - Connect to multiple upstream MCP servers simultaneously
- **All transports** - Supports stdio, SSE, and Streamable HTTP for both upstream and downstream
- **Per-tool policies** - Configure different compression thresholds and masking rules for different tools

## Installation

```bash
npm install -g mcp-context-proxy
```

Or run directly with npx:
```bash
npx mcp-context-proxy --help
```

For deployment options (PM2, Docker), see [INSTALLATION.md](./INSTALLATION.md).

## Quick Start

1. Generate a config file:
```bash
mcp-context-proxy --init
```

2. Edit `mcpcp.config.json` to configure your upstream servers and compression model:
```json
{
  "version": 2,
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
  "defaults": {
    "compression": {
      "enabled": true,
      "tokenThreshold": 1000,
      "maxOutputTokens": 500,
      "goalAware": true
    },
    "cache": {
      "enabled": true,
      "ttlSeconds": 300
    }
  },
  "compression": {
    "baseUrl": "http://localhost:8080/v1",
    "model": "your-model"
  },
  "cache": {
    "maxEntries": 1000,
    "cacheErrors": true
  }
}
```

3. Run the proxy:
```bash
mcp-context-proxy
```

## Web Dashboard

When running with HTTP transports (`sse` or `streamable-http`), MCPCP provides a web dashboard for monitoring and configuration.

<img width="1465" height="765" alt="image" src="https://github.com/user-attachments/assets/ebccb567-3d2d-4eb8-b2a6-cebcb09297eb" />


### Accessing the Dashboard

The dashboard is available at the root URL of your proxy:

```
http://localhost:3000/
```

(Replace `localhost:3000` with your configured host and port)

> **Note:** The dashboard is only available with HTTP transports. When using `stdio` transport, there is no HTTP server and thus no dashboard.

### Dashboard Features

The dashboard has three tabs: **Configuration** (default), **Logs**, and **Status**.

#### Configuration Editor

The default tab provides a JSON editor for modifying your proxy configuration:

1. **View current config** - The editor loads your active configuration
2. **Edit inline** - Modify settings directly in the browser
3. **Validate** - Configuration is validated before applying
4. **Hot reload** - Click "Apply & Reload" to apply changes without restarting the proxy

Hot reload will:
- Disconnect from old upstreams
- Apply the new configuration
- Reconnect to upstreams (including any new ones)
- Refresh all aggregated tools, resources, and prompts

> **Tip:** Keep the Logs tab open while reloading to monitor the reconnection process.

#### Logs

Streams proxy logs in real-time via SSE:

- **Log levels** - Filter by debug, info, warn, error
- **Auto-scroll** - Automatically follows new log entries
- **Searchable** - Find specific log messages

Useful for debugging compression behavior, upstream connection issues, or cache hits/misses.

#### Status

Shows proxy status and upstream connections:

- **Proxy status** - Whether the proxy is running and healthy
- **Upstream connections** - Each connected MCP server with its connection status
- **Tool/Resource/Prompt counts** - Number of items aggregated from each upstream

Click on any upstream to expand and see its full list of tools, resources, and prompts.

### API Endpoints

The dashboard uses these API endpoints, which are also available for programmatic access:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Current proxy and upstream status |
| `/api/status/:upstreamId` | GET | Details for a specific upstream |
| `/api/config` | GET | Current configuration (JSON) |
| `/api/config` | PUT | Save configuration to disk |
| `/api/config/validate` | POST | Validate configuration without saving |
| `/api/reload` | POST | Reload configuration from disk |
| `/api/logs/stream` | GET | SSE stream of real-time logs |
| `/health` | GET | Health check endpoint |

## Configuration

MCPCP supports a flexible configuration system with a **three-level hierarchy** (global defaults → upstream defaults → tool-specific) for controlling compression, masking, and caching behaviors. This eliminates repetition and allows precise control when needed.

**For practical examples, use cases, and detailed guidance, see [CONFIGURATION.md](./CONFIGURATION.md).**

### Configuration File

- **Default location:** `mcpcp.config.json` in the current directory
- **Custom location:** Use `--config <path>` flag
- **Generate template:** Run `mcp-context-proxy --init`
- **Current version:** `version: 2` ([Migration from v0.3.x](https://github.com/samteezy/mcp-context-proxy/issues/13#issuecomment-3710637305))

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

#### Infrastructure Settings

The top-level `compression` object configures **where and how to connect** to the compression LLM:

| Field | Type | Description |
|-------|------|-------------|
| `baseUrl` | `string` | OpenAI-compatible API base URL |
| `apiKey` | `string` | API key (optional for local models) |
| `model` | `string` | Model identifier |
| `bypassEnabled` | `boolean` | Inject `_mcpcp_bypass` field to allow skipping compression (default: false) |
| `retryEscalation` | `object` | Auto-increase output on repeated tool calls (see below) |

#### Compression Policy

**Compression policies** (when/how to compress) are configured via the **three-level hierarchy**: `defaults.compression`, `upstreams[].defaults.compression`, `upstreams[].tools[name].compression`

**Resolution:** Tool-specific > Upstream defaults > Global defaults > Built-in defaults

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | `boolean` | Enable/disable compression (default: true) |
| `tokenThreshold` | `number` | Minimum tokens to trigger compression (default: 1000) |
| `maxOutputTokens` | `number` | Maximum tokens in compressed output |
| `goalAware` | `boolean` | Inject `_mcpcp_goal` field into tool schemas (default: true) |
| `customInstructions` | `string` | Additional instructions for compression LLM |

**See:** [CONFIGURATION.md - Use Cases](./CONFIGURATION.md#configuration-by-use-case) for practical examples

#### Retry Escalation

Automatically increases `maxOutputTokens` on repeated tool calls within a sliding window when compression may have removed needed information.

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | `boolean` | Enable retry escalation (default: true) |
| `windowSeconds` | `number` | Sliding window to track calls (default: 60) |
| `tokenMultiplier` | `number` | Linear multiplier per retry (default: 2) |

**Behavior:** 1st call uses normal `maxOutputTokens`, 2nd call within window uses `maxOutputTokens * 2`, 3rd uses `maxOutputTokens * 3`, etc.

**See:** [CONFIGURATION.md - Retry Escalation Pattern](./CONFIGURATION.md#pattern-retry-escalation) for detailed examples

#### Compression Metadata

All compressed responses include a metadata header:

```
[Compressed: 14246→283 tokens, strategy: json]
[Compressed: 14246→566 tokens, strategy: json, escalation: 2x]
```

Format: `[Compressed: {original}→{compressed} tokens, strategy: {json|code|default}, escalation: {multiplier}]`

#### Bypass Field

When `bypassEnabled: true`, adds `_mcpcp_bypass` field to all tool schemas. Clients can set this to `true` to receive the full uncompressed response.

**See:** [CONFIGURATION.md - Bypass Pattern](./CONFIGURATION.md#pattern-bypass-field)

### Cache

#### Infrastructure Settings

The top-level `cache` object configures cache infrastructure:

| Field | Type | Description |
|-------|------|-------------|
| `maxEntries` | `number` | Maximum cache entries (default: 1000) |
| `cacheErrors` | `boolean` | Cache error responses (default: true) |

#### Cache Policy

**Cache policies** (when/how long to cache) are configured via the **three-level hierarchy**: `defaults.cache`, `upstreams[].defaults.cache`, `upstreams[].tools[name].cache`

**Resolution:** Tool-specific > Upstream defaults > Global defaults > Built-in defaults

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | `boolean` | Enable/disable caching (default: true) |
| `ttlSeconds` | `number` | Cache entry TTL in seconds (default: 300) |

**Cache Key:** tool name + arguments + normalized goal

**Goal Normalization:** Lowercase + removes all punctuation. Examples: "Find API!" → "find api", "What's this?" → "whats this"

**See:** [CONFIGURATION.md - Aggressive Caching](./CONFIGURATION.md#use-case-aggressive-caching-for-static-content) for practical examples

### Tool Configuration

Configure individual tools within each upstream's `tools` object using the tool's **original name** (not namespaced):

| Field | Type | Description |
|-------|------|-------------|
| `hidden` | `boolean` | Hide this tool from clients (default: false) |
| `compression` | `object` | Per-tool compression policy overrides |
| `masking` | `object` | Per-tool PII masking policy overrides |
| `cache` | `object` | Per-tool cache policy overrides |
| `overwriteDescription` | `string` | Replace the tool's description |
| `hideParameters` | `string[]` | Parameters to hide from client schema |
| `parameterOverrides` | `object` | Server-side parameter injection |

#### Hiding Tools

Set `hidden: true` to prevent tools from appearing in `tools/list`. Hidden tools are rejected if called directly.

**See:** [CONFIGURATION.md - Hiding Unwanted Tools](./CONFIGURATION.md#use-case-hiding-unwanted-tools)

#### Description Overrides

Use `overwriteDescription` to replace a tool's description and control LLM behavior. If `goalAware` is enabled, the `_mcpcp_goal` instruction is auto-appended.

**See:** [CONFIGURATION.md - Description Overrides Pattern](./CONFIGURATION.md#pattern-description-overrides)

#### Parameter Hiding & Overrides

- **`hideParameters`**: Array of parameter names to remove from client schema
- **`parameterOverrides`**: Object of parameter name → value mappings for server-side injection

**Rules:**
- All hidden parameters MUST have corresponding overrides (validated at config load)
- Overrides are applied BEFORE PII masking
- Overrides take precedence over client-provided values

**See:** [CONFIGURATION.md - Optimizing Web Fetch](./CONFIGURATION.md#use-case-optimizing-web-fetch-tools)

### PII Masking (Experimental)

Protects sensitive data by masking before forwarding to upstreams and restoring before returning to the client.

**Flow:** Client → [MASK] → Upstream → [RESTORE] → Client

#### Infrastructure Settings

The top-level `masking` object configures infrastructure and acts as a **master switch**:

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | `boolean` | **Master switch** - must be true for any masking to work (default: false) |
| `llmConfig` | `object` | Optional LLM config for fallback detection |

**Important:** Even if policies enable masking, it won't run unless the global master switch is enabled.

#### Masking Policy

**Masking policies** are configured via the **three-level hierarchy**: `defaults.masking`, `upstreams[].defaults.masking`, `upstreams[].tools[name].masking`

**Resolution:** Tool-specific > Upstream defaults > Global defaults > Built-in defaults

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | `boolean` | Enable/disable masking for this tool |
| `piiTypes` | `string[]` | PII types to mask (default: `["email", "ssn", "phone", "credit_card", "ip_address"]`) |
| `llmFallback` | `boolean` | Use LLM for ambiguous cases (default: false) |
| `llmFallbackThreshold` | `"low" \| "medium" \| "high"` | Trigger LLM for patterns at or below this confidence (default: "low") |
| `customPatterns` | `object` | Custom regex patterns |

#### Supported PII Types

Placeholders are numbered sequentially per type starting from 1 (e.g., `[EMAIL_1]`, `[EMAIL_2]`, `[EMAIL_3]`, ...) to allow proper restoration of unique values.

| Type | Placeholder Format | Confidence | Example |
|------|-------------------|------------|---------|
| `email` | `[EMAIL_n]` | high | `user@example.com` |
| `ssn` | `[SSN_n]` | medium | `123-45-6789` |
| `phone` | `[PHONE_n]` | medium | `555-123-4567` |
| `credit_card` | `[CREDIT_CARD_n]` | high | `4111111111111111` |
| `ip_address` | `[IP_n]` | high | `192.168.1.100` |
| `date_of_birth` | `[DOB_n]` | high | `01/15/1990` (only with DOB/birth keywords) |
| `passport` | `[PASSPORT_n]` | low | `A12345678` |
| `driver_license` | `[DL_n]` | low | `D1234567` |

**Note:** Low-confidence patterns (passport, driver_license) may produce false positives. Consider using `llmFallback: true` for these.

**See:** [CONFIGURATION.md - PII Protection](./CONFIGURATION.md#use-case-pii-protection-experimental) for complete examples

## Tool Namespacing

Tools from upstream servers are namespaced to avoid conflicts:
- Original tool: `read_file`
- Namespaced: `{upstream_id}__read_file`

## Compression Strategies

mcp-context-proxy auto-detects content type and applies the appropriate strategy:

| Strategy | Trigger | Behavior |
|----------|---------|----------|
| `code` | Function definitions, imports, class syntax | Preserves signatures, summarizes implementation |
| `json` | Valid JSON | Preserves structure, shortens values |
| `default` | Everything else | General text compression |

## Requirements

- Node.js 24+
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

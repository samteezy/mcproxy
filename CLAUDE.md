# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

mcproxy (mcproxy Lightens Inference Processing) is a transparent MCP proxy that intercepts tool responses from upstream MCP servers and compresses large responses using an external LLM before passing them to resource-constrained local models.

## Build & Development Commands

```bash
npm run dev          # Development mode with hot reload (tsx watch)
npm run build        # Production build (tsup)
npm start            # Run production build
npm test             # Run tests (vitest)
npm run test:coverage  # Run tests with coverage
npm run lint         # ESLint
npm run typecheck    # TypeScript type checking
```

## Architecture

```
MCP Client → mcproxy (Proxy) → MCP Server(s)
                 ↓
         Compression Model (OpenAI-compatible)
```

mcproxy acts as a man-in-the-middle:
- **Downstream:** Exposes MCP server interface to clients (Claude Desktop, Cursor, etc.)
- **Upstream:** Connects as MCP client to one or more actual MCP servers
- **Compression:** Intercepts tool responses exceeding token threshold and compresses via external LLM

### Key Components May Include

- `src/proxy.ts` - Main proxy orchestration
- `src/mcp/server.ts` - Downstream MCP server implementation
- `src/mcp/client.ts` - Upstream MCP client implementation
- `src/mcp/aggregator.ts` - Tool/resource/prompt aggregation from multiple upstreams
- `src/mcp/router.ts` - Route requests to correct upstream server
- `src/compression/` - Compression logic with strategy selection (default/JSON/code)
- `src/cache/` - Response caching layer

### Transport Support

mcproxy supports stdio, SSE, and Streamable HTTP for both downstream (as server) and upstream (as client) connections.

### Compression Strategies

Three strategies auto-selected based on content:
- **default** - General text compression
- **json** - Preserves JSON structure
- **code** - Preserves function signatures and structure

## Tech Stack

- Node.js 20+, TypeScript 5.x
- `@modelcontextprotocol/sdk` - MCP implementation
- `ai` / `@ai-sdk/openai-compatible` - LLM API client (Vercel)
- `ai-tokenizer` - Token counting
- `winston` - Logging
- `vitest` - Testing
- `tsup` - Build

Note that anytime you're working with npm packages, you're always checking to ensure we're on the most current version.

## Testing

### LLM Inference Endpoint
- OpenAI-compatible endpoint at http://10.10.3.197:8080/v1/ with model "LFM2-1.2B"
- Do not set up the MCP proxy with yourself (Claude Code). Use curl or a separate tool to test.

### Testing with curl (Streamable HTTP transport)

The Streamable HTTP transport requires specific headers. Always include:
- `Content-Type: application/json`
- `Accept: application/json, text/event-stream`

**List tools:**
```bash
curl -s -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq
```

**Call a tool (with goal-aware compression):**
```bash
curl -s -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"fetch__fetch","arguments":{"url":"https://example.com","max_length":50000,"_mcproxy_goal":"Finding specific information about X"}}}' | jq
```

**Test with large content (llama-server README):**
```bash
curl -s -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"fetch__fetch","arguments":{"url":"https://raw.githubusercontent.com/ggml-org/llama.cpp/refs/heads/master/tools/server/README.md","max_length":50000,"_mcproxy_goal":"Finding the API endpoints for chat completions"}}}' | jq
```

### Goal-Aware Compression

The `_mcproxy_goal` field is automatically injected into all tool schemas when `goalAware` is enabled (default: true). When provided:
- The goal is stripped before forwarding to upstream MCP servers
- The goal is included in the compression prompt to focus on relevant information
- Example: 14,246 tokens → 283 tokens (98% reduction) with targeted goal

## References
- Project repo: github.com/samteezy/mcproxy
- MCPO: https://github.com/open-webui/mcpo/tree/main
- MCP SDK: https://github.com/modelcontextprotocol/typescript-sdk
- Vercel SDK: https://ai-sdk.dev/docs/getting-started/nodejs
- ai-tokenizer: https://www.npmjs.com/package/ai-tokenizer

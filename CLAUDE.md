# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

mcp-context-proxy is a transparent MCP proxy that intercepts tool responses from upstream MCP servers and compresses large responses using an external LLM before passing them to resource-constrained local models.

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

## Release Management

Releases are automated via GitHub Actions with npm trusted publishing (OIDC).

**Standard release:**
```bash
npm version patch    # or minor, major
git push --follow-tags
```

This bumps the version, creates a git tag, and triggers the workflow which:
- Runs tests and build
- Publishes to npm with provenance
- Creates a GitHub release with auto-generated notes

**Manual release** (if tag push didn't trigger):
1. Go to Actions → Release → "Run workflow"
2. Enter the tag name (e.g., `v0.3.1`)

**Setup notes:**
- Trusted publishing configured on npmjs.com (no NPM_TOKEN needed)
- Workflow: `.github/workflows/release.yml`

## Architecture

```
MCP Client → mcp-context-proxy → MCP Server(s)
                    ↓
         Compression Model (OpenAI-compatible)
```

mcp-context-proxy acts as a man-in-the-middle:
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

mcp-context-proxy supports stdio, SSE, and Streamable HTTP for both downstream (as server) and upstream (as client) connections.

### Compression Strategies

Three strategies auto-selected based on content:
- **default** - General text compression
- **json** - Preserves JSON structure
- **code** - Preserves function signatures and structure

## Tech Stack

- Node.js 24+, TypeScript 5.x
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
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"fetch__fetch","arguments":{"url":"https://example.com","max_length":50000,"_mcpcp_goal":"Finding specific information about X"}}}' | jq
```

**Test with large content (llama-server README):**
```bash
curl -s -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"fetch__fetch","arguments":{"url":"https://raw.githubusercontent.com/ggml-org/llama.cpp/refs/heads/master/tools/server/README.md","max_length":50000,"_mcpcp_goal":"Finding the API endpoints for chat completions"}}}' | jq
```

### Goal-Aware Compression

The `_mcpcp_goal` field is automatically injected into all tool schemas when `goalAware` is enabled (default: true). When provided:
- The goal is stripped before forwarding to upstream MCP servers
- The goal is included in the compression prompt to focus on relevant information
- Example: 14,246 tokens → 283 tokens (98% reduction) with targeted goal

## References
- Project repo: github.com/samteezy/mcp-context-proxy
- MCPO: https://github.com/open-webui/mcpo/tree/main
- MCP SDK: https://github.com/modelcontextprotocol/typescript-sdk
- Vercel SDK: https://ai-sdk.dev/docs/getting-started/nodejs
- ai-tokenizer: https://www.npmjs.com/package/ai-tokenizer

## Misc Guidelines
- GH issues should be a main source of truth for enhancements, bugs, etc. 
- Always attempt to update existing issues if we're working on one, so progress isn't lost.
- Whenever reviewing a GH issue, merge request, etc - always attempt to pull all related comments, too.
- Run `npm typecheck` and `npm run build` often in your development process.
- Run `npm run test:coverage` before making any commits. If any tests fail, this must be immediately addressed with the user.
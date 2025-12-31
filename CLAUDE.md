# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCPith is a transparent MCP proxy that intercepts tool responses from upstream MCP servers and compresses large responses using an external LLM before passing them to resource-constrained local models.

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
MCP Client → MCPith (Proxy) → MCP Server(s)
                 ↓
         Compression Model (OpenAI-compatible)
```

MCPith acts as a man-in-the-middle:
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

MCPith supports stdio, SSE, and Streamable HTTP for both downstream (as server) and upstream (as client) connections.

### Compression Strategies

Three strategies auto-selected based on content:
- **default** - General text compression
- **json** - Preserves JSON structure
- **code** - Preserves function signatures and structure

## Tech Stack

- Node.js 20+, TypeScript 5.x
- `@modelcontextprotocol/sdk` - MCP implementation
- `ai` / `@ai-sdk/openai-compatible` - LLM API client (Vercel)
- `gpt-tokenizer` - Token counting
- `winston` - Logging
- `vitest` - Testing
- `tsup` - Build

## Testing
- To test the LLM inference, there is an OpenAI-compatible endpoint at http://10.10.3.197:8080/v1/ and you can call the model "LFM2-1.2B".
- Do not set up the MCP proxy with yourself (Claude Code). Either use a separate tool locally to test the MCP, or give the user setup and testing instructions.

## Future Enhancements

The following features are planned for future implementation:

1. **Tool Hiding** - Ability to disable/hide certain tools entirely from being exposed to clients. Many MCPs include extra tools that users may not want to expose.

2. **Tool Renaming/Rewriting** - Ability for users to rewrite tool names and/or descriptions. This allows customizing how tools appear to clients without modifying upstream servers.

## References
- MCPO: https://github.com/open-webui/mcpo/tree/main
- MCP SDK: https://github.com/modelcontextprotocol/typescript-sdk
- Vercel SDK: https://ai-sdk.dev/docs/getting-started/nodejs
- gpt-tokenizer: https://www.npmjs.com/package/gpt-tokenizer
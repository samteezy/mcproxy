# MCPCP Configuration Guide

This guide provides practical examples and use cases for configuring MCP Context Proxy. For detailed field reference documentation, see [README - Configuration](./README.md#configuration).

## Introduction

MCPCP uses a **three-level configuration hierarchy** for controlling proxy behaviors (compression, masking, caching):

```
Global Defaults → Upstream Defaults → Tool-Specific
(lowest priority)                     (highest priority)
```

**Philosophy:** Configure once at the global level, override at the upstream level for groups of tools, and fine-tune at the tool level when needed. This eliminates repetition and keeps configuration organized.

**How it works:**
- Settings at lower levels inherit from higher levels
- Only defined properties override (undefined properties preserve parent values)
- Tool-specific settings take ultimate precedence

For complete field reference, see [README - Configuration](./README.md#configuration).

---

## Quick Start Examples

### Example 1: Basic Setup (Single Upstream)

**Use case:** Simple stdio proxy with basic compression

```json
{
  "version": 2,
  "downstream": {
    "transport": "stdio"
  },
  "upstreams": [
    {
      "id": "filesystem",
      "name": "Filesystem",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    }
  ],
  "defaults": {
    "compression": {
      "enabled": true,
      "tokenThreshold": 1000,
      "maxOutputTokens": 500
    }
  },
  "compression": {
    "baseUrl": "http://localhost:8080/v1",
    "model": "LFM2-1.2B"
  }
}
```

**What this does:**
- Listens on stdio (for Claude Desktop, Cursor, etc.)
- Connects to filesystem MCP server
- Compresses responses over 1000 tokens down to max 500 tokens
- Uses local LLM at `localhost:8080` for compression

**When to use:** Getting started, single MCP server, local development

---

### Example 2: Multi-Server Setup with HTTP Transport

**Use case:** Multiple upstreams with web dashboard

```json
{
  "version": 2,
  "downstream": {
    "transport": "streamable-http",
    "host": "0.0.0.0",
    "port": 3000
  },
  "upstreams": [
    {
      "id": "filesystem",
      "name": "Filesystem",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    },
    {
      "id": "fetch",
      "name": "Fetch",
      "transport": "stdio",
      "command": "uvx",
      "args": ["mcp-server-fetch"]
    },
    {
      "id": "context7",
      "name": "Context7",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp", "--api-key", "your-api-key"]
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
    "model": "LFM2-1.2B"
  },
  "cache": {
    "maxEntries": 1000,
    "cacheErrors": true
  }
}
```

**What this does:**
- Serves HTTP on port 3000 (web dashboard available at `http://localhost:3000/`)
- Aggregates 3 upstream MCP servers
- Enables goal-aware compression (adds `_mcpcp_goal` field to tool schemas)
- Caches responses for 5 minutes

**When to use:** Production deployments, monitoring needed, multiple MCP servers

---

### Example 3: Production Setup with Optimizations

**Use case:** Production config with parameter hiding, tool hiding, custom instructions

```json
{
  "version": 2,
  "downstream": {
    "transport": "streamable-http",
    "host": "0.0.0.0",
    "port": 3000
  },
  "upstreams": [
    {
      "id": "fetch",
      "name": "Fetch",
      "transport": "stdio",
      "command": "uvx",
      "args": ["mcp-server-fetch"],
      "tools": {
        "fetch": {
          "compression": {
            "tokenThreshold": 2000,
            "maxOutputTokens": 1000,
            "customInstructions": "Preserve all URLs, dates, and code examples verbatim. Focus on main content and omit navigation/footer elements."
          },
          "overwriteDescription": "Fetches the contents of a URL. Use this only when the user has provided a specific URL in their message.",
          "hideParameters": ["max_length"],
          "parameterOverrides": {
            "max_length": 100000
          }
        }
      }
    },
    {
      "id": "github",
      "name": "GitHub",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "tools": {
        "create_issue": { "hidden": true },
        "delete_repository": { "hidden": true },
        "push_files": { "hidden": true }
      }
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
      "ttlSeconds": 600
    }
  },
  "compression": {
    "baseUrl": "http://localhost:8080/v1",
    "model": "LFM2-1.2B",
    "bypassEnabled": true,
    "retryEscalation": {
      "enabled": true,
      "windowSeconds": 60,
      "tokenMultiplier": 2
    }
  },
  "cache": {
    "maxEntries": 2000,
    "cacheErrors": false
  }
}
```

**What this does:**
- Hides `max_length` from LLM, injects 100KB server-side (LLMs can't predict optimal value)
- Custom compression instructions for web content
- Hides dangerous GitHub tools (write operations)
- Enables bypass field (LLM can request uncompressed response if needed)
- Retry escalation: auto-increases output tokens on repeated calls
- Longer cache TTL (10 minutes), more cache entries

**When to use:** Production, security-conscious deployments, optimized for performance

---

## Configuration by Use Case

### Use Case: Optimizing Web Fetch Tools

**Problem:** Fetch tools return massive amounts of data. LLMs can't predict the optimal `max_length` before seeing content. Setting it too low truncates important information; too high wastes tokens.

**Solution Approach:**
- Hide `max_length` parameter from LLM
- Inject high value (50000-100000) server-side
- Enable goal-aware compression
- Use custom instructions to focus on relevant content
- Let compression handle size reduction

**Complete Configuration:**

```json
{
  "version": 2,
  "downstream": {
    "transport": "stdio"
  },
  "upstreams": [
    {
      "id": "fetch",
      "name": "Fetch",
      "transport": "stdio",
      "command": "uvx",
      "args": ["mcp-server-fetch"],
      "tools": {
        "fetch": {
          "compression": {
            "tokenThreshold": 2000,
            "maxOutputTokens": 1000,
            "goalAware": true,
            "customInstructions": "Preserve all URLs, dates, and code examples verbatim. Focus on main content and omit navigation, ads, and footer elements."
          },
          "overwriteDescription": "Fetches the contents of a URL. Use this only when the user has provided a specific URL in their message.",
          "hideParameters": ["max_length"],
          "parameterOverrides": {
            "max_length": 100000
          }
        }
      }
    }
  ],
  "defaults": {
    "compression": {
      "enabled": true,
      "tokenThreshold": 1000,
      "maxOutputTokens": 500
    }
  },
  "compression": {
    "baseUrl": "http://localhost:8080/v1",
    "model": "LFM2-1.2B"
  }
}
```

**Explanation:**

1. **`hideParameters: ["max_length"]`** - Removes `max_length` from tool schema shown to client LLM
2. **`parameterOverrides: { "max_length": 100000 }`** - Automatically injects 100KB limit when forwarding to upstream
3. **`tokenThreshold: 2000`** - Only compress if response exceeds 2000 tokens (fetched pages are usually large)
4. **`maxOutputTokens: 1000`** - Compress down to 1000 tokens (overrides global default of 500)
5. **`goalAware: true`** - Adds `_mcpcp_goal` field; LLM specifies what it's looking for ("Find API endpoints for chat completions")
6. **`customInstructions`** - Guides compression to preserve specific content types
7. **`overwriteDescription`** - Prevents LLM from calling fetch prematurely without a URL

**Field Reference:** [README - Compression](./README.md#compression), [README - Tool Configuration](./README.md#tool-configuration)

**Variations:**

- **Lower threshold:** Use `tokenThreshold: 500` if you want compression even for small pages
- **Cloud compression:** For public web pages, use cloud API (OpenAI, Anthropic) for free/cheap compression instead of local model
- **Multiple fetch tools:** If you have multiple fetch-like tools, configure at upstream defaults instead of per-tool

**Common Mistakes:**

- ❌ Hiding parameters without providing overrides (config validation will fail)
- ❌ Setting `max_length` override too low (defeats the purpose)
- ❌ Not using `goalAware` (compression is less targeted)
- ❌ Using client-provided overrides without hiding (LLM will still see and potentially override)

---

### Use Case: Disable Compression for Specific Tools

**Problem:** Some tools return structured data (JSON, code) that shouldn't be compressed, or responses are already small enough.

**Solution Approach:**
- Use upstream defaults for most tools
- Disable compression for specific tools via tool-level config
- Alternatively, disable for entire upstream if all tools should skip compression

**Complete Configuration:**

```json
{
  "version": 2,
  "downstream": {
    "transport": "stdio"
  },
  "upstreams": [
    {
      "id": "filesystem",
      "name": "Filesystem",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      "defaults": {
        "compression": {
          "tokenThreshold": 500
        }
      },
      "tools": {
        "read_file": {
          "compression": { "enabled": false }
        },
        "list_directory": {
          "compression": { "enabled": false }
        }
      }
    },
    {
      "id": "database",
      "name": "Database",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-server-database"],
      "defaults": {
        "compression": { "enabled": false }
      }
    }
  ],
  "defaults": {
    "compression": {
      "enabled": true,
      "tokenThreshold": 1000,
      "maxOutputTokens": 500
    }
  },
  "compression": {
    "baseUrl": "http://localhost:8080/v1",
    "model": "LFM2-1.2B"
  }
}
```

**Explanation:**

1. **Global default:** Compression enabled, 1000 token threshold
2. **Filesystem upstream:** Lower threshold (500) for most tools via `upstream.defaults`
3. **Filesystem tools:** `read_file` and `list_directory` explicitly disable compression (responses are usually short/structured)
4. **Database upstream:** All tools disable compression via `upstream.defaults` (database queries return structured data)

**Resolution for `filesystem__read_file`:**
- `enabled`: `false` (tool-level override)
- `tokenThreshold`: `500` (upstream default, but irrelevant since disabled)
- `maxOutputTokens`: `500` (global default, but irrelevant since disabled)

**Resolution for `database__query`:**
- `enabled`: `false` (upstream default)
- `tokenThreshold`: `1000` (global default, but irrelevant)

**Field Reference:** [README - Compression](./README.md#compression)

**Variations:**

- **Disable globally, enable selectively:** Set `defaults.compression.enabled: false`, then enable only for specific tools
- **High threshold instead of disable:** Use very high `tokenThreshold` (e.g., 10000) to effectively disable for most responses

**Common Mistakes:**

- ❌ Forgetting that tool-level overrides need the full tool name (not namespaced: use `read_file`, not `filesystem__read_file`)
- ❌ Setting threshold at wrong level (if all upstream tools need same threshold, use `upstream.defaults`)

---

### Use Case: Aggressive Caching for Static Content

**Problem:** Documentation lookups, API reference queries, and static content requests are repeated frequently, wasting LLM calls and time.

**Solution Approach:**
- Long TTL for documentation/reference tools
- Disable cache for dynamic/real-time tools
- Use goal normalization to catch query variations

**Complete Configuration:**

```json
{
  "version": 2,
  "downstream": {
    "transport": "stdio"
  },
  "upstreams": [
    {
      "id": "fetch",
      "name": "Fetch",
      "transport": "stdio",
      "command": "uvx",
      "args": ["mcp-server-fetch"],
      "defaults": {
        "cache": {
          "ttlSeconds": 3600
        }
      }
    },
    {
      "id": "weather",
      "name": "Weather API",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-server-weather"],
      "defaults": {
        "cache": { "enabled": false }
      }
    },
    {
      "id": "context7",
      "name": "Context7",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp", "--api-key", "your-api-key"],
      "tools": {
        "query-docs": {
          "cache": {
            "ttlSeconds": 7200
          }
        }
      }
    }
  ],
  "defaults": {
    "compression": {
      "enabled": true,
      "tokenThreshold": 1000,
      "maxOutputTokens": 500
    },
    "cache": {
      "enabled": true,
      "ttlSeconds": 300
    }
  },
  "compression": {
    "baseUrl": "http://localhost:8080/v1",
    "model": "LFM2-1.2B"
  },
  "cache": {
    "maxEntries": 2000,
    "cacheErrors": false
  }
}
```

**Explanation:**

1. **Global default:** 5 minute cache TTL for all tools
2. **Fetch upstream:** 1 hour TTL (documentation, READMEs, etc. don't change often)
3. **Weather upstream:** Cache disabled (real-time data, different every request)
4. **Context7 query-docs:** 2 hour TTL (documentation is very static)
5. **Cache infrastructure:** 2000 max entries, don't cache errors

**Cache Key Behavior:**
- Includes: tool name + arguments + normalized goal
- Goal normalization: "Find the API endpoints!" → "find the api endpoints"
- Effect: Variations like "find api endpoints", "Find API Endpoints", etc. share cache

**Example:**

```bash
# First request: Cache miss, calls compression LLM, caches result
curl ... -d '{"method":"tools/call","params":{"name":"fetch__fetch","arguments":{"url":"https://example.com/docs","_mcpcp_goal":"Find API endpoints"}}}'

# Second request within TTL: Cache hit, instant response (no LLM call)
curl ... -d '{"method":"tools/call","params":{"name":"fetch__fetch","arguments":{"url":"https://example.com/docs","_mcpcp_goal":"find api endpoints!"}}}'
```

**Field Reference:** [README - Cache](./README.md#cache)

**Variations:**

- **Very long TTL:** Use `ttlSeconds: 86400` (24 hours) for extremely static content
- **Selective error caching:** Set `cache.cacheErrors: true` globally, disable per-tool for critical operations

**Common Mistakes:**

- ❌ Caching real-time/dynamic data (weather, stock prices, current time)
- ❌ TTL too short for static content (wastes cache space with redundant entries)
- ❌ Not considering goal normalization (similar goals share cache, which is usually good but can be surprising)

---

### Use Case: Hiding Unwanted Tools

**Problem:** MCP servers expose tools you don't want (write operations, dangerous actions, irrelevant functionality), cluttering context and risking misuse.

**Solution Approach:**
- Set `hidden: true` for unwanted tools
- Hidden tools don't appear in `tools/list`
- Calls to hidden tools return "tool not found"

**Complete Configuration:**

```json
{
  "version": 2,
  "downstream": {
    "transport": "stdio"
  },
  "upstreams": [
    {
      "id": "github",
      "name": "GitHub",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "tools": {
        "create_issue": { "hidden": true },
        "create_pull_request": { "hidden": true },
        "delete_repository": { "hidden": true },
        "push_files": { "hidden": true }
      }
    },
    {
      "id": "filesystem",
      "name": "Filesystem",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user"],
      "tools": {
        "write_file": { "hidden": true },
        "create_directory": { "hidden": true },
        "move_file": { "hidden": true }
      }
    }
  ],
  "defaults": {
    "compression": {
      "enabled": true,
      "tokenThreshold": 1000,
      "maxOutputTokens": 500
    }
  },
  "compression": {
    "baseUrl": "http://localhost:8080/v1",
    "model": "LFM2-1.2B"
  }
}
```

**Explanation:**

1. **GitHub:** Hide all write/mutating operations (create, delete, push)
2. **Filesystem:** Hide write operations (write_file, create_directory, move_file)
3. **Effect:** Client LLM only sees read-only tools (read_file, list_directory, search_repositories, etc.)

**Benefits:**
- **Reduced context:** Fewer tools in initial prompt = faster processing
- **Safety:** LLM can't accidentally trigger dangerous operations
- **Focus:** LLM attention on relevant tools only

**Field Reference:** [README - Tool Configuration](./README.md#tool-configuration)

**Variations:**

- **Conditional hiding:** Different configs for different environments (hide write ops in prod, show in dev)
- **Hide by pattern:** If many tools to hide, consider upstream filtering or forking the MCP server

**Common Mistakes:**

- ❌ Hiding tools you actually need (test thoroughly)
- ❌ Forgetting tools are namespaced in logs but configured with original names

---

### Use Case: Custom Compression Instructions

**Problem:** Default compression loses important information (URLs, dates, code examples, error messages) or includes unnecessary details.

**Solution Approach:**
- Use `customInstructions` field per tool
- Specify what to preserve verbatim
- Specify what to omit or summarize
- Instructions are appended to compression prompt

**Complete Configuration:**

```json
{
  "version": 2,
  "downstream": {
    "transport": "stdio"
  },
  "upstreams": [
    {
      "id": "fetch",
      "name": "Fetch",
      "transport": "stdio",
      "command": "uvx",
      "args": ["mcp-server-fetch"],
      "tools": {
        "fetch": {
          "compression": {
            "customInstructions": "Preserve all URLs, dates, version numbers, and code examples verbatim. Omit navigation menus, footers, and advertisements. Focus on main article content."
          }
        }
      }
    },
    {
      "id": "database",
      "name": "Database",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-server-database"],
      "tools": {
        "query": {
          "compression": {
            "customInstructions": "Preserve table names, column names, row counts, and error messages exactly. Omit individual data rows unless specifically relevant to errors. Focus on query result structure and metadata."
          }
        }
      }
    },
    {
      "id": "logs",
      "name": "Log Server",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-server-logs"],
      "tools": {
        "search_logs": {
          "compression": {
            "customInstructions": "Preserve all error messages, stack traces, timestamps, and log levels verbatim. Group similar log entries and provide counts. Omit INFO-level logs unless they contain errors or warnings."
          }
        }
      }
    }
  ],
  "defaults": {
    "compression": {
      "enabled": true,
      "tokenThreshold": 1000,
      "maxOutputTokens": 500
    }
  },
  "compression": {
    "baseUrl": "http://localhost:8080/v1",
    "model": "LFM2-1.2B"
  }
}
```

**Explanation:**

Each tool has tailored instructions based on its content:

1. **Fetch:** Preserve technical details (URLs, versions, code), omit web page chrome
2. **Database query:** Preserve schema/metadata, omit raw data rows
3. **Log search:** Preserve errors/stack traces, summarize repetitive entries

**How it works:**
- Custom instructions are appended to the compression system/user prompt
- Compression strategy (json/code/default) is still auto-detected
- Goal (if provided via `_mcpcp_goal`) is also included

**Field Reference:** [README - Compression](./README.md#compression)

**Variations:**

- **Generic instructions at upstream level:** If all tools from an upstream need similar handling, use `upstream.defaults.compression.customInstructions`
- **Combine with goal-aware:** Custom instructions + user goal = highly targeted compression

**Common Mistakes:**

- ❌ Instructions too vague ("preserve important information")
- ❌ Instructions too strict (compression can't reduce size enough)
- ❌ Not testing compression output to verify instructions work

---

### Use Case: PII Protection (Experimental)

**Problem:** Don't want sensitive data (emails, SSNs, credit cards) sent to upstream MCP servers or cloud APIs.

**Solution Approach:**
- Enable global masking master switch
- Configure PII types to mask
- Use LLM fallback for low-confidence patterns
- Data is masked before upstream, restored before client

**Complete Configuration:**

```json
{
  "version": 2,
  "downstream": {
    "transport": "stdio"
  },
  "upstreams": [
    {
      "id": "database",
      "name": "Database",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-server-database"],
      "defaults": {
        "masking": {
          "piiTypes": ["email", "ssn", "phone", "credit_card"],
          "llmFallback": true,
          "llmFallbackThreshold": "low"
        }
      },
      "tools": {
        "query": {
          "masking": {
            "customPatterns": {
              "employee_id": {
                "regex": "EMP[0-9]{6}",
                "replacement": "[EMPLOYEE_ID]"
              }
            }
          }
        }
      }
    },
    {
      "id": "logs",
      "name": "Logs",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-server-logs"],
      "tools": {
        "read_log": {
          "masking": { "enabled": false }
        }
      }
    }
  ],
  "defaults": {
    "compression": {
      "enabled": true,
      "tokenThreshold": 1000,
      "maxOutputTokens": 500
    },
    "masking": {
      "enabled": true,
      "piiTypes": ["email", "phone"],
      "llmFallback": false
    }
  },
  "masking": {
    "enabled": true,
    "llmConfig": {
      "baseUrl": "http://localhost:8080/v1",
      "model": "LFM2-1.2B"
    }
  },
  "compression": {
    "baseUrl": "http://localhost:8080/v1",
    "model": "LFM2-1.2B"
  }
}
```

**Explanation:**

1. **Global masking master switch:** `masking.enabled: true` (required for any masking to work)
2. **Global defaults:** Mask emails and phone numbers with regex only (no LLM fallback)
3. **Database upstream:** Mask emails, SSNs, phones, credit cards + use LLM for ambiguous cases
4. **Database query tool:** Add custom pattern for employee IDs (EMP123456 → [EMPLOYEE_ID])
5. **Logs read_log tool:** Disable masking (internal logs, no PII concern)
6. **Masking LLM:** Use local model for PII detection fallback

**Flow Example:**

```
Client sends: "SELECT * FROM users WHERE email='alice@example.com'"
       ↓
   [MASK]     "SELECT * FROM users WHERE email='[EMAIL_1]'"  (upstream never sees original)
       ↓
  Upstream    Processes with masked email
       ↓
  [RESTORE]   "alice@example.com" restored in response
       ↓
Client gets: Original data with PII intact
```

**Supported PII Types:**

| Type | Confidence | Example |
|------|------------|---------|
| `email` | high | user@example.com |
| `ssn` | medium | 123-45-6789 |
| `phone` | medium | 555-123-4567 |
| `credit_card` | high | 4111111111111111 |
| `ip_address` | high | 192.168.1.100 |
| `date_of_birth` | high | 01/15/1990 (with DOB keywords) |
| `passport` | low | A12345678 |
| `driver_license` | low | D1234567 |

**Placeholder Format:** Masked values are replaced with numbered placeholders starting from 1 (e.g., `[EMAIL_1]`, `[EMAIL_2]`, `[SSN_1]`, etc.)

**LLM Fallback:**
- `llmFallback: true` - Use LLM for patterns at or below threshold
- `llmFallbackThreshold: "low"` - Trigger for low, medium, high confidence patterns
- Use for low-confidence patterns (passport, driver_license) to reduce false positives

**Field Reference:** [README - PII Masking](./README.md#pii-masking-experimental)

**Variations:**

- **Masking for cloud compression:** Mask before sending to cloud LLM for compression, keep original for local processing
- **Selective masking:** Only mask specific upstreams that connect to external services

**Common Mistakes:**

- ❌ Forgetting global master switch (masking won't work even if policies enable it)
- ❌ Using low-confidence patterns without LLM fallback (many false positives)
- ❌ Not testing restore logic (ensure original values come back to client)
- ❌ Assuming masking is 100% accurate (experimental feature, may miss patterns)

---

## Understanding the Three-Level Hierarchy

### How Resolution Works

The configuration hierarchy follows a **deep merge** pattern with **tool-level highest priority**:

```
Tool-Specific > Upstream Defaults > Global Defaults > Built-in Defaults
```

**Built-in Defaults** (hardcoded):
```javascript
{
  compression: {
    enabled: true,
    tokenThreshold: 1000,
    goalAware: true,
    maxOutputTokens: undefined  // Optional: LLM decides compression ratio
  },
  masking: { enabled: false },
  cache: { enabled: true, ttlSeconds: 300 }
}
```

**Resolution Algorithm:**
1. Start with built-in defaults
2. Merge `config.defaults.compression` (shallow merge: only defined properties override)
3. Merge `upstream.defaults.compression` (if defined)
4. Merge `upstream.tools[toolName].compression` (if defined)
5. Result: Fully resolved policy with all fields guaranteed

**Example Walkthrough:**

```json
{
  "defaults": {
    "compression": {
      "enabled": true,
      "tokenThreshold": 1000,
      "maxOutputTokens": 500,
      "goalAware": true
    }
  },
  "upstreams": [{
    "id": "api-server",
    "defaults": {
      "compression": {
        "tokenThreshold": 300
      }
    },
    "tools": {
      "search": {
        "compression": {
          "maxOutputTokens": 200,
          "customInstructions": "Focus on IDs and counts."
        }
      }
    }
  }]
}
```

**Resolution for `api-server__search`:**

| Field | Source | Value |
|-------|--------|-------|
| `enabled` | Global defaults | `true` |
| `tokenThreshold` | Upstream defaults | `300` |
| `maxOutputTokens` | Tool config | `200` |
| `goalAware` | Global defaults | `true` |
| `customInstructions` | Tool config | `"Focus on IDs and counts."` |

**Resolution for `api-server__list_users` (no tool config):**

| Field | Source | Value |
|-------|--------|-------|
| `enabled` | Global defaults | `true` |
| `tokenThreshold` | Upstream defaults | `300` |
| `maxOutputTokens` | Global defaults | `500` |
| `goalAware` | Global defaults | `true` |
| `customInstructions` | (undefined) | `undefined` |

### When to Use Each Level

#### Use Global Defaults When:

- Setting organization-wide baseline behavior
- Most tools should behave the same way
- Establishing safe defaults that can be overridden as needed

**Example:**
```json
{
  "defaults": {
    "compression": { "enabled": true, "tokenThreshold": 1000 },
    "cache": { "enabled": true, "ttlSeconds": 300 }
  }
}
```

#### Use Upstream Defaults When:

- All tools from a specific server need similar behavior
- Grouping tools by purpose (e.g., all database tools, all filesystem tools)
- Reducing repetition across similar tools

**Example:**
```json
{
  "upstreams": [{
    "id": "filesystem",
    "defaults": {
      "compression": { "enabled": false }  // Filesystem tools return small/structured data
    }
  }]
}
```

#### Use Tool-Specific When:

- One tool is an exception to upstream defaults
- Fine-tuning for problematic tools
- Custom instructions for specific use cases

**Example:**
```json
{
  "upstreams": [{
    "id": "fetch",
    "defaults": {
      "compression": { "tokenThreshold": 2000 }
    },
    "tools": {
      "fetch_binary": {
        "compression": { "enabled": false }  // Binary data shouldn't be compressed
      }
    }
  }]
}
```

### Migration from v0.3.x

MCPCP v0.4.0 introduced the three-level hierarchy to replace flat configuration. The config loader automatically migrates v0.3.x configs, but understanding the mapping helps when writing new configs.

**v0.3.x format (deprecated):**
```json
{
  "compression": {
    "baseUrl": "http://localhost:8080/v1",
    "model": "LFM2-1.2B",
    "defaultPolicy": {
      "enabled": true,
      "tokenThreshold": 1000
    }
  },
  "cache": {
    "enabled": true,
    "ttlSeconds": 300,
    "maxEntries": 1000
  }
}
```

**v0.4.0+ format (current):**
```json
{
  "version": 2,
  "defaults": {
    "compression": {
      "enabled": true,
      "tokenThreshold": 1000
    },
    "cache": {
      "enabled": true,
      "ttlSeconds": 300
    }
  },
  "compression": {
    "baseUrl": "http://localhost:8080/v1",
    "model": "LFM2-1.2B"
  },
  "cache": {
    "maxEntries": 1000
  }
}
```

**Key Changes:**
- `compression.defaultPolicy` → `defaults.compression`
- `cache.enabled` / `cache.ttlSeconds` → `defaults.cache`
- Infrastructure settings stay at top level
- Policy settings move to `defaults` (and can be overridden at upstream/tool levels)

**Full migration guide:** [GitHub Issue #13](https://github.com/samteezy/mcp-context-proxy/issues/13#issuecomment-3710637305)

---

## Advanced Patterns

### Pattern: Retry Escalation

**When:** Compression removes information that the client LLM needs, causing it to retry the same tool call.

**How it works:**

MCPCP tracks repeated calls to the same tool within a sliding window and automatically increases `maxOutputTokens` on each retry.

**Timeline Example:**

```
00:00 - LLM calls fetch__fetch (url=example.com, goal="Find API endpoints")
        → Response compressed: 14246 tokens → 500 tokens (1x)
        → LLM receives: [Compressed: 14246→500 tokens, strategy: json]

00:15 - LLM calls fetch__fetch again (same URL, same goal)
        → Retry detected! Escalation: 2x
        → Response compressed: 14246 tokens → 1000 tokens (2x)
        → LLM receives: [Compressed: 14246→1000 tokens, strategy: json, escalation: 2x]

00:30 - LLM calls fetch__fetch again
        → Retry detected! Escalation: 3x
        → Response compressed: 14246 tokens → 1500 tokens (3x)
        → LLM receives: [Compressed: 14246→1500 tokens, strategy: json, escalation: 3x]

01:15 - Window expires (60s default), counter resets
        → Next call uses 1x again
```

**Configuration:**

```json
{
  "compression": {
    "baseUrl": "http://localhost:8080/v1",
    "model": "LFM2-1.2B",
    "retryEscalation": {
      "enabled": true,
      "windowSeconds": 60,
      "tokenMultiplier": 2
    }
  },
  "defaults": {
    "compression": {
      "maxOutputTokens": 500
    }
  }
}
```

**Parameters:**
- `enabled`: Enable retry escalation (default: true)
- `windowSeconds`: Sliding window to track calls (default: 60)
- `tokenMultiplier`: Linear multiplier per retry (default: 2)

**Behavior with defaults:**
- 1st call: `maxOutputTokens = 500` (1x)
- 2nd call within 60s: `maxOutputTokens = 1000` (2x)
- 3rd call within 60s: `maxOutputTokens = 1500` (3x)
- Unlimited escalation (no max multiplier)

**Field Reference:** [README - Retry Escalation](./README.md#retry-escalation)

**When to disable:**
- Memory-constrained compression models
- Strict token budgets
- Tools where retries are not expected

---

### Pattern: Bypass Field

**When:** Compression removed critical information and the LLM needs the full uncompressed response.

**How to use:**

1. Enable in config:
```json
{
  "compression": {
    "baseUrl": "http://localhost:8080/v1",
    "model": "LFM2-1.2B",
    "bypassEnabled": true
  }
}
```

2. MCPCP adds `_mcpcp_bypass` field to all tool schemas

3. Client LLM can set `_mcpcp_bypass: true` to get uncompressed response:

```bash
curl -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "fetch__fetch",
      "arguments": {
        "url": "https://example.com",
        "_mcpcp_bypass": true
      }
    }
  }'
```

**Result:** Response is NOT compressed, full content returned to client

**Use Cases:**
- Debugging compression issues
- LLM determines compressed response is missing information
- One-off requests that need complete data

**Trade-offs:**
- Bypassed responses can be very large (thousands of tokens)
- Client LLM context fills up quickly
- Slower prompt processing

**Field Reference:** [README - Bypass Field](./README.md#bypass-field)

**Best Practice:** Let retry escalation handle most cases, use bypass as last resort

---

### Pattern: Description Overrides

**When:** Want to control when/how the client LLM selects tools without modifying upstream servers.

**Examples:**

**Prevent premature tool calls:**
```json
{
  "tools": {
    "fetch": {
      "overwriteDescription": "Fetches the contents of a URL. Use this only when the user has provided a specific URL in their message. Do not use for general web searches."
    }
  }
}
```

**Add usage constraints:**
```json
{
  "tools": {
    "delete_file": {
      "overwriteDescription": "Deletes a file from the filesystem. IMPORTANT: Always confirm with the user before deleting files. Only use after explicit user approval."
    }
  }
}
```

**Clarify ambiguous tools:**
```json
{
  "tools": {
    "search": {
      "overwriteDescription": "Searches the product database for items matching the query. Use this for product searches, NOT web searches. Returns product IDs, names, and prices."
    }
  }
}
```

**How it works:**
- Completely replaces upstream tool description
- If `goalAware: true`, the `_mcpcp_goal` instruction is auto-appended
- Client LLM sees your custom description in `tools/list`

**Field Reference:** [README - Tool Configuration](./README.md#tool-configuration)

**Best Practice:**
- Keep descriptions concise but specific
- Include usage constraints if relevant
- Mention what the tool returns

---

### Pattern: Mixed Transports

**When:** Some MCP servers are local (stdio), some are remote (HTTP), or you want flexibility.

**Configuration:**

```json
{
  "version": 2,
  "downstream": {
    "transport": "streamable-http",
    "host": "0.0.0.0",
    "port": 3000
  },
  "upstreams": [
    {
      "id": "filesystem",
      "name": "Filesystem (local)",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    },
    {
      "id": "cloud-api",
      "name": "Cloud API (remote)",
      "transport": "streamable-http",
      "url": "https://api.example.com/mcp"
    },
    {
      "id": "internal-service",
      "name": "Internal Service (SSE)",
      "transport": "sse",
      "url": "http://internal-server:8080/sse"
    }
  ],
  "defaults": {
    "compression": {
      "enabled": true,
      "tokenThreshold": 1000,
      "maxOutputTokens": 500
    }
  },
  "compression": {
    "baseUrl": "http://localhost:8080/v1",
    "model": "LFM2-1.2B"
  }
}
```

**What this does:**
- Downstream: HTTP server on port 3000 (web dashboard available)
- Upstream 1: Local stdio process (filesystem tools)
- Upstream 2: Remote HTTP server (cloud API)
- Upstream 3: Remote SSE server (internal service)

**Use Cases:**
- Hybrid deployments (some local, some cloud)
- Testing (stdio for dev, HTTP for prod)
- Flexibility (add/remove upstreams without changing transport)

**Field Reference:** [README - Downstream](./README.md#downstream-client-facing), [README - Upstreams](./README.md#upstreams-mcp-servers)

---

## Troubleshooting

### Compression Not Triggering

**Symptom:** Responses are not being compressed even though compression is enabled.

**Possible Causes:**

1. **Response below threshold**
   - Check: Response token count vs. `tokenThreshold`
   - Solution: Lower threshold or verify response is actually large

2. **Compression disabled at higher priority level**
   - Check: Tool-level or upstream-level `compression.enabled: false`
   - Solution: Review hierarchy, remove overrides if unintended

3. **Compression model not accessible**
   - Check: Logs for connection errors to `compression.baseUrl`
   - Solution: Verify model is running, check URL/port

4. **Goal-aware field missing**
   - Check: If `goalAware: true`, verify client is providing `_mcpcp_goal`
   - Solution: Client must provide goal, or disable `goalAware`

**Debug Steps:**
1. Check logs (web dashboard `/logs` or console)
2. Verify resolved policy: logs show effective config per tool
3. Test with curl: manually call tool with known large response
4. Check compression model: test endpoint directly

**Field Reference:** [README - Compression](./README.md#compression)

---

### Cache Not Working

**Symptom:** Same request returns different results, cache misses when hits expected.

**Possible Causes:**

1. **Goal variation**
   - Cache key includes normalized goal (lowercase, all punctuation removed)
   - WILL cache match: "Find API!" = "find-api" = "find api" (all normalize to "find api")
   - WON'T cache match: "findapi" ≠ "find api" (spaces are preserved)
   - Solution: Be aware that similarly phrased goals share cache entries

2. **Arguments different**
   - Cache key includes ALL arguments (including hidden/overridden params)
   - Solution: Ensure exact same arguments for cache hit

3. **TTL expired**
   - Check: `ttlSeconds` vs. time between requests
   - Solution: Increase TTL or check cache expiration logs

4. **Cache disabled at higher level**
   - Check: Tool/upstream overrides
   - Solution: Review hierarchy

5. **Cache errors disabled**
   - If request errors, cache won't store (if `cacheErrors: false`)
   - Solution: Enable `cache.cacheErrors: true` or fix error

**Debug Steps:**
1. Check logs for cache hits/misses
2. Compare cache keys (logged on each request)
3. Verify goal normalization
4. Check TTL and max entries

**Field Reference:** [README - Cache](./README.md#cache)

---

### Tools Not Appearing

**Symptom:** Tools don't show up in `tools/list` response.

**Possible Causes:**

1. **Tool is hidden**
   - Check: `tools[name].hidden: true` in config
   - Solution: Remove `hidden` or set to `false`

2. **Upstream disabled**
   - Check: `upstreams[].enabled: false` in config
   - Solution: Enable upstream

3. **Upstream connection failed**
   - Check: Logs for connection errors
   - Solution: Verify upstream command/URL, check upstream server is running

4. **Tool namespacing confusion**
   - Tools are namespaced as `{upstream_id}__original_name`
   - Solution: Look for namespaced names, not original names

**Debug Steps:**
1. Check web dashboard `/api/status` (if HTTP transport)
2. Review logs for upstream connection status
3. Call `tools/list` and inspect response
4. Verify upstream server works independently

**Field Reference:** [README - Tool Configuration](./README.md#tool-configuration), [README - Tool Namespacing](./README.md#tool-namespacing)

---

### Parameter Overrides Not Applied

**Symptom:** Parameters are not being injected or are using wrong values.

**Possible Causes:**

1. **Hidden params without overrides**
   - Config validation requires: all hidden params must have overrides
   - Solution: Add to `parameterOverrides` or remove from `hideParameters`

2. **Override precedence**
   - Client-provided values override server-side... wait, no they don't!
   - Overrides take precedence over client values
   - Solution: This is expected behavior

3. **Masking applied after overrides**
   - Overrides happen BEFORE masking
   - If override value contains PII, it will be masked
   - Solution: Adjust masking patterns or use non-PII override values

4. **Tool name mismatch**
   - Config uses original tool name, not namespaced
   - Solution: Use `fetch`, not `fetch__fetch`

**Debug Steps:**
1. Check logs for parameter injection
2. Verify config validation passed
3. Test with curl, inspect forwarded arguments
4. Review tool config syntax

**Field Reference:** [README - Parameter Hiding & Overrides](./README.md#parameter-hiding--overrides)

---

## Configuration Reference

For complete field reference, validation rules, and detailed descriptions, see:

**[README - Configuration](./README.md#configuration)**

Includes:
- All configuration fields and types
- Infrastructure vs. policy settings
- Field-by-field documentation
- Validation requirements
- Default values

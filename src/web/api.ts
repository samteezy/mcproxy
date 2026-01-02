/**
 * API routes for the admin UI
 */
import type { Application, Request, Response } from "express";
import { readFileSync, writeFileSync, renameSync } from "fs";
import { configSchema } from "../config/schema.js";
import { getStreamingTransport } from "../logger.js";
import type { CLIPConfig, UpstreamStatus } from "../types.js";

export interface ApiContext {
  configPath: string;
  getStatus: () => UpstreamStatus[];
  reload: (config: CLIPConfig) => Promise<void>;
  loadConfig: (path: string) => CLIPConfig;
}

/**
 * Register API routes on the Express app
 */
export function registerApiRoutes(app: Application, context: ApiContext): void {
  // GET /api/config - Read config file
  app.get("/api/config", (_req: Request, res: Response) => {
    try {
      const content = readFileSync(context.configPath, "utf-8");
      res.json({
        path: context.configPath,
        content,
      });
    } catch (error) {
      res.status(500).json({
        error: `Failed to read config: ${(error as Error).message}`,
      });
    }
  });

  // PUT /api/config - Write config file
  app.put("/api/config", (req: Request, res: Response) => {
    try {
      // Get raw body as text
      let content: string;
      if (typeof req.body === "string") {
        content = req.body;
      } else if (Buffer.isBuffer(req.body)) {
        content = req.body.toString("utf-8");
      } else {
        content = JSON.stringify(req.body, null, 2);
      }

      // Parse JSON
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch (e) {
        res.status(400).json({
          success: false,
          error: `Invalid JSON: ${(e as Error).message}`,
        });
        return;
      }

      // Validate with Zod
      const result = configSchema.safeParse(parsed);
      if (!result.success) {
        res.status(400).json({
          success: false,
          error: "Validation failed",
          issues: result.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        });
        return;
      }

      // Write atomically via temp file
      const tempPath = context.configPath + ".tmp";
      writeFileSync(tempPath, content);
      renameSync(tempPath, context.configPath);

      res.json({ success: true, message: "Configuration saved" });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: `Failed to save config: ${(error as Error).message}`,
      });
    }
  });

  // POST /api/config/validate - Validate config without saving
  app.post("/api/config/validate", (req: Request, res: Response) => {
    try {
      // Get raw body
      let content: string;
      if (typeof req.body === "string") {
        content = req.body;
      } else if (Buffer.isBuffer(req.body)) {
        content = req.body.toString("utf-8");
      } else {
        content = JSON.stringify(req.body);
      }

      // Parse JSON
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch (e) {
        res.json({
          valid: false,
          issues: [{ path: "", message: `JSON syntax error: ${(e as Error).message}` }],
        });
        return;
      }

      // Validate
      const result = configSchema.safeParse(parsed);
      if (!result.success) {
        res.json({
          valid: false,
          issues: result.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        });
        return;
      }

      res.json({ valid: true });
    } catch (error) {
      res.json({
        valid: false,
        issues: [{ path: "", message: (error as Error).message }],
      });
    }
  });

  // POST /api/reload - Reload configuration
  app.post("/api/reload", async (_req: Request, res: Response) => {
    try {
      const newConfig = context.loadConfig(context.configPath);
      await context.reload(newConfig);

      res.json({
        success: true,
        message: "Configuration reloaded",
        upstreams: context.getStatus(),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: `Failed to reload: ${(error as Error).message}`,
      });
    }
  });

  // GET /api/logs/stream - SSE endpoint for log streaming
  app.get("/api/logs/stream", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

    const transport = getStreamingTransport();
    if (!transport) {
      res.write(`data: ${JSON.stringify({ type: "error", message: "Log streaming not available" })}\n\n`);
      res.end();
      return;
    }

    // Send recent logs as initial batch
    const recent = transport.getRecentLogs(100);
    res.write(`data: ${JSON.stringify({ type: "history", logs: recent })}\n\n`);

    // Subscribe to new logs
    const unsubscribe = transport.subscribe((entry) => {
      try {
        res.write(`data: ${JSON.stringify({ type: "log", entry })}\n\n`);
      } catch {
        // Connection closed
        unsubscribe();
      }
    });

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      try {
        res.write(": heartbeat\n\n");
      } catch {
        clearInterval(heartbeat);
        unsubscribe();
      }
    }, 30000);

    // Cleanup on close
    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  // GET /api/status - Get current status (alternative to /health)
  app.get("/api/status", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      upstreams: context.getStatus(),
    });
  });
}

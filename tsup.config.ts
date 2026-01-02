import { defineConfig } from "tsup";

export default defineConfig([
  // Main Node.js build
  {
    entry: ["src/index.ts", "src/cli.ts"],
    format: ["esm"],
    dts: true,
    clean: true,
    sourcemap: true,
    target: "node20",
    shims: false,
    // Don't bundle winston-transport as it has CommonJS require issues
    external: ["winston-transport"],
  },
  // Browser bundle for CodeMirror editor
  {
    entry: { "editor-bundle": "src/web/editor-bundle.ts" },
    format: ["iife"],
    globalName: "mcproxyEditor",
    outDir: "dist/web",
    minify: true,
    sourcemap: false,
    target: "es2020",
    platform: "browser",
    // Bundle all dependencies into the output
    noExternal: [/.*/],
  },
]);

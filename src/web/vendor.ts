/**
 * Vendor assets for the admin UI
 * These are read at runtime from the dist folder
 */
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Find project root by looking for package.json
function findProjectRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, "package.json"))) {
      return dir;
    }
    dir = dirname(dir);
  }
  // Fallback to __dirname
  return __dirname;
}

const projectRoot = findProjectRoot();

let editorBundleCache: string | null = null;
let alpineBundleCache: string | null = null;

/**
 * Get the CodeMirror editor bundle (IIFE)
 */
export function getEditorBundle(): string {
  if (!editorBundleCache) {
    const bundlePath = resolve(projectRoot, "dist", "web", "editor-bundle.global.js");
    editorBundleCache = readFileSync(bundlePath, "utf-8");
  }
  return editorBundleCache;
}

/**
 * Get the Alpine.js bundle
 */
export function getAlpineBundle(): string {
  if (!alpineBundleCache) {
    const alpinePath = resolve(projectRoot, "node_modules", "alpinejs", "dist", "cdn.min.js");
    alpineBundleCache = readFileSync(alpinePath, "utf-8");
  }
  return alpineBundleCache;
}

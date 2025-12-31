import type { CompressionStrategy } from "../types.js";

/**
 * Detect the appropriate compression strategy based on content
 */
export function detectStrategy(content: string): CompressionStrategy {
  // Try to parse as JSON
  try {
    JSON.parse(content);
    return "json";
  } catch {
    // Not valid JSON
  }

  // Check for code-like patterns
  if (isCodeLike(content)) {
    return "code";
  }

  return "default";
}

/**
 * Check if content looks like code
 */
function isCodeLike(content: string): boolean {
  const codePatterns = [
    // Function declarations
    /\bfunction\s+\w+\s*\(/,
    /\bconst\s+\w+\s*=\s*(?:async\s*)?\(/,
    /\bdef\s+\w+\s*\(/,
    /\bclass\s+\w+/,
    // Common syntax
    /\bimport\s+.*\s+from\s+/,
    /\brequire\s*\(/,
    /\bexport\s+(?:default\s+)?(?:function|class|const|let|var)/,
    // Braces and semicolons pattern (multiple occurrences)
    /[{};]\s*\n.*[{};]\s*\n/,
    // Method/property access chains
    /\.\w+\([^)]*\)\.\w+\(/,
    // Arrow functions
    /=>\s*{/,
    // Type annotations (TypeScript)
    /:\s*(?:string|number|boolean|void|any|unknown)\b/,
  ];

  const matchCount = codePatterns.filter((pattern) =>
    pattern.test(content)
  ).length;

  // Consider it code if multiple patterns match
  return matchCount >= 2;
}

/**
 * Get the compression prompt for a given strategy
 */
export function getCompressionPrompt(
  strategy: CompressionStrategy,
  content: string,
  maxTokens?: number,
  goal?: string
): string {
  const tokenLimit = maxTokens
    ? `Keep the output under ${maxTokens} tokens.`
    : "Be as concise as possible.";

  const goalContext = goal
    ? `\n\nThe caller's goal: "${goal}"\nFocus on preserving information most relevant to this purpose.\n`
    : "";

  switch (strategy) {
    case "json":
      return `You are a JSON compression assistant.${goalContext}Compress the following JSON data while preserving its structure and all important values. Remove redundant whitespace, shorten key names if possible while keeping them understandable, and summarize repeated patterns. ${tokenLimit}

JSON to compress:
${content}

Respond with only the compressed JSON, no explanations.`;

    case "code":
      return `You are a code summarization assistant.${goalContext}Summarize the following code while preserving:
- Function/class signatures and their parameters
- Key logic and algorithms
- Important comments
- Return types and values

Remove implementation details that aren't critical to understanding what the code does. ${tokenLimit}

Code to summarize:
${content}

Respond with the summarized code or pseudocode, no explanations.`;

    case "default":
    default:
      return `You are a text compression assistant.${goalContext}Compress the following text while preserving all important information, facts, and data. Remove redundancy and verbose language. ${tokenLimit}

Text to compress:
${content}

Respond with only the compressed text, no explanations.`;
  }
}

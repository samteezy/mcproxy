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
 *
 * Structure: Content first (in XML tags), instructions last.
 * This leverages recency bias - instructions are fresh when generating.
 */
export function getCompressionPrompt(
  strategy: CompressionStrategy,
  content: string,
  maxTokens?: number,
  goal?: string
): string {
  const tokenLimit = maxTokens
    ? `Keep your response under ${maxTokens} tokens.`
    : "Be as concise as possible.";

  const goalInstruction = goal
    ? `\n\nIMPORTANT - The caller's goal: "${goal}"\nPrioritize information relevant to this goal. Omit content that doesn't serve this purpose.`
    : "";

  switch (strategy) {
    case "json":
      return `<document type="json">
${content}
</document>

<task>
Compress the JSON above while preserving structure and important values. Remove redundant whitespace, shorten keys if possible, and summarize repeated patterns.${goalInstruction}

${tokenLimit}
Output only the compressed JSON, no explanations.
</task>`;

    case "code":
      return `<document type="code">
${content}
</document>

<task>
Summarize the code above while preserving:
- Function/class signatures and parameters
- Key logic and algorithms
- Important comments
- Return types and values

Remove non-critical implementation details.${goalInstruction}

${tokenLimit}
Output only the summarized code or pseudocode, no explanations.
</task>`;

    case "default":
    default:
      return `<document>
${content}
</document>

<task>
Compress the document above while preserving all important information, facts, and data. Remove redundancy and verbose language.${goalInstruction}

${tokenLimit}
Output only the compressed text, no explanations.
</task>`;
  }
}

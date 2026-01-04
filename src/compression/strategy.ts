import type { CompressionStrategy } from "../types.js";

/**
 * Detect the appropriate compression strategy based on content
 */
export function detectStrategy(content: string): CompressionStrategy {
  // Try to parse as JSON - expected to fail for non-JSON content
  try {
    JSON.parse(content);
    return "json";
  } catch {
    // Not valid JSON, continue to check other strategies
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
 * Build common prompt components used in compression prompts
 */
function buildPromptComponents(
  maxTokens?: number,
  customInstructions?: string
): { tokenLimit: string; customInstructionBlock: string } {
  const tokenLimit = maxTokens
    ? `Keep your response under ${maxTokens} tokens.`
    : "Be concise while retaining helpful details.";

  const customInstructionBlock = customInstructions
    ? `\nADDITIONAL INSTRUCTIONS: ${customInstructions}`
    : "";

  return { tokenLimit, customInstructionBlock };
}

/**
 * Build compression prompts using system/user separation.
 *
 * Returns an object with system and user prompts:
 * - System: Compression instructions (immutable task definition)
 * - User: Content to process + optional goal context
 *
 * This structure works universally for all content types (JSON, code, text)
 * and handles both goal-focused extraction and general compression.
 */
export function getCompressionPrompt(
  content: string,
  maxTokens?: number,
  goal?: string,
  customInstructions?: string
): { system: string; user: string } {
  const { tokenLimit, customInstructionBlock } = buildPromptComponents(
    maxTokens,
    customInstructions
  );

  // System prompt: Universal compression/extraction instructions
  const systemPrompt = `You are a compression assistant. Your task is to compress or extract information from documents while preserving what matters.

${goal ? `When a goal is provided, extract ONLY information relevant to that goal. Completely omit irrelevant sections - they waste tokens.` : `Compress the content while preserving important information, facts, and data. Remove redundancy and verbose language.`}

General guidelines:
- Preserve structure and formatting where helpful (JSON keys, code signatures, headings)
- Remove non-critical details, boilerplate, and repetition
- Be direct and concise${customInstructionBlock}

${tokenLimit}

Output only the compressed/extracted content. No explanations, preambles, or commentary.`;

  // User prompt: The content + optional goal
  let userPrompt = `<document>\n${content}\n</document>`;

  if (goal) {
    userPrompt += `\n\n<goal>\n${goal}\n</goal>`;
  }

  return { system: systemPrompt, user: userPrompt };
}

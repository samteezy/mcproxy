import { describe, it, expect } from "vitest";
import { detectStrategy, getCompressionPrompt } from "./strategy.js";

describe("detectStrategy", () => {
  describe("JSON detection", () => {
    it("should detect valid JSON object", () => {
      const content = '{"key": "value", "number": 42}';
      expect(detectStrategy(content)).toBe("json");
    });

    it("should detect valid JSON array", () => {
      const content = '[1, 2, 3, "test"]';
      expect(detectStrategy(content)).toBe("json");
    });

    it("should detect nested JSON", () => {
      const content = '{"user": {"name": "test", "age": 25}, "items": [1, 2, 3]}';
      expect(detectStrategy(content)).toBe("json");
    });

    it("should detect pretty-printed JSON", () => {
      const content = `{
  "key": "value",
  "nested": {
    "data": true
  }
}`;
      expect(detectStrategy(content)).toBe("json");
    });

    it("should return default for malformed JSON", () => {
      const content = '{"key": "value"'; // Missing closing brace
      expect(detectStrategy(content)).toBe("default");
    });

    it("should return default for JSON-like but invalid content", () => {
      const content = '{this is not json}';
      expect(detectStrategy(content)).toBe("default");
    });
  });

  describe("code detection", () => {
    it("should detect JavaScript function declaration", () => {
      const content = `
function testFunction(arg) {
  return arg + 1;
}
`;
      expect(detectStrategy(content)).toBe("code");
    });

    it("should detect const arrow function", () => {
      const content = `
const myFunc = (x) => {
  return x * 2;
};
const another = () => {};
`;
      expect(detectStrategy(content)).toBe("code");
    });

    it("should detect Python function", () => {
      const content = `
def calculate(x, y):
    return x + y

class MyClass:
    def __init__(self):
        pass
`;
      expect(detectStrategy(content)).toBe("code");
    });

    it("should detect class declaration", () => {
      const content = `
class MyClass {
  constructor() {
    this.value = 0;
  }
}
`;
      expect(detectStrategy(content)).toBe("code");
    });

    it("should detect ES6 import/export", () => {
      const content = `
import { something } from 'module';
export default function test() {}
`;
      expect(detectStrategy(content)).toBe("code");
    });

    it("should detect TypeScript with type annotations", () => {
      const content = `
function add(a: number, b: number): number {
  return a + b;
}
const name: string = "test";
`;
      expect(detectStrategy(content)).toBe("code");
    });

    it("should detect code with braces and semicolons", () => {
      const content = `
function process(data) {
  if (condition) {
    doSomething();
  }
  for (let i = 0; i < 10; i++) {
    process(i);
  }
}
`;
      expect(detectStrategy(content)).toBe("code");
    });

    it("should detect method chaining", () => {
      const content = `
const fetchData = async () => {
  const result = api
    .getData()
    .then(data => data.process())
    .catch(err => console.error(err));
  return result;
};
`;
      expect(detectStrategy(content)).toBe("code");
    });

    it("should detect CommonJS require", () => {
      const content = `
const fs = require('fs');
const path = require('path');
module.exports = { test };
`;
      expect(detectStrategy(content)).toBe("code");
    });

    it("should detect async functions", () => {
      const content = `
const fetchData = async (url) => {
  const response = await fetch(url);
  return response.json();
};
`;
      expect(detectStrategy(content)).toBe("code");
    });

    it("should require multiple code patterns (not just one)", () => {
      // Just one brace pattern - not enough
      const content = "This is a sentence with a {brace}.";
      expect(detectStrategy(content)).toBe("default");
    });
  });

  describe("default strategy fallback", () => {
    it("should return default for plain text", () => {
      const content = "This is just regular text with no special structure.";
      expect(detectStrategy(content)).toBe("default");
    });

    it("should return default for markdown", () => {
      const content = `# Heading

This is some markdown text with **bold** and *italic*.

- List item 1
- List item 2
`;
      expect(detectStrategy(content)).toBe("default");
    });

    it("should return default for mixed content without code patterns", () => {
      const content = "Some text here. And more text there. No code patterns.";
      expect(detectStrategy(content)).toBe("default");
    });

    it("should return default for empty string", () => {
      expect(detectStrategy("")).toBe("default");
    });
  });
});

describe("getCompressionPrompt", () => {
  describe("system/user prompt structure", () => {
    it("should return object with system and user prompts", () => {
      const prompts = getCompressionPrompt("test content", 500);

      expect(prompts).toHaveProperty("system");
      expect(prompts).toHaveProperty("user");
      expect(typeof prompts.system).toBe("string");
      expect(typeof prompts.user).toBe("string");
    });

    it("should place content in user prompt", () => {
      const content = '{"test": "data"}';
      const prompts = getCompressionPrompt(content, 500);

      expect(prompts.user).toContain("<document>");
      expect(prompts.user).toContain(content);
      expect(prompts.user).toContain("</document>");
    });

    it("should place instructions in system prompt", () => {
      const prompts = getCompressionPrompt("test", 500);

      expect(prompts.system).toContain("compression assistant");
      expect(prompts.system).toContain("compress");
      expect(prompts.system).toContain("under 500 tokens");
    });
  });

  describe("goal handling", () => {
    it("should include goal in user prompt when provided", () => {
      const prompts = getCompressionPrompt("test content", 500, "Find user data");

      expect(prompts.user).toContain("<goal>");
      expect(prompts.user).toContain("Find user data");
      expect(prompts.user).toContain("</goal>");
    });

    it("should omit goal tags when not provided", () => {
      const prompts = getCompressionPrompt("test content", 500);

      expect(prompts.user).not.toContain("<goal>");
      expect(prompts.user).not.toContain("</goal>");
    });

    it("should adjust system prompt based on goal presence", () => {
      const withoutGoal = getCompressionPrompt("test", 500);
      const withGoal = getCompressionPrompt("test", 500, "Find data");

      expect(withoutGoal.system).toContain("Compress the content");
      expect(withGoal.system).toContain("extract ONLY information relevant to that goal");
      expect(withGoal.system).toContain("Completely omit irrelevant sections");
    });
  });

  describe("maxTokens handling", () => {
    it("should include token limit when provided", () => {
      const prompts = getCompressionPrompt("test", 250);
      expect(prompts.system).toContain("under 250 tokens");
    });

    it("should use generic message when maxTokens not provided", () => {
      const prompts = getCompressionPrompt("test");
      expect(prompts.system).toContain("Be concise while retaining helpful details");
      expect(prompts.system).not.toContain("under");
    });
  });

  describe("custom instructions", () => {
    it("should append custom instructions when provided", () => {
      const prompts = getCompressionPrompt(
        "test",
        500,
        undefined,
        "Focus on technical details"
      );

      expect(prompts.system).toContain("ADDITIONAL INSTRUCTIONS:");
      expect(prompts.system).toContain("Focus on technical details");
    });

    it("should not include custom instructions block when not provided", () => {
      const prompts = getCompressionPrompt("test", 500);
      expect(prompts.system).not.toContain("ADDITIONAL INSTRUCTIONS");
    });

    it("should include custom instructions with goal", () => {
      const prompts = getCompressionPrompt(
        "test",
        500,
        "Find data",
        "Preserve timestamps"
      );

      expect(prompts.system).toContain("ADDITIONAL INSTRUCTIONS:");
      expect(prompts.system).toContain("Preserve timestamps");
    });
  });

  describe("unified strategy handling", () => {
    it("should use same prompt structure for all content types", () => {
      const jsonContent = '{"key": "value"}';
      const codeContent = "function test() {}";
      const textContent = "Plain text content";

      const jsonPrompts = getCompressionPrompt(jsonContent, 500);
      const codePrompts = getCompressionPrompt(codeContent, 500);
      const textPrompts = getCompressionPrompt(textContent, 500);

      // All should have same structure (system instructions don't vary by content type)
      expect(jsonPrompts.system).toContain("compression assistant");
      expect(codePrompts.system).toContain("compression assistant");
      expect(textPrompts.system).toContain("compression assistant");

      // User prompts should all use <document> tags (no type attribute)
      expect(jsonPrompts.user).toMatch(/<document>\n/);
      expect(codePrompts.user).toMatch(/<document>\n/);
      expect(textPrompts.user).toMatch(/<document>\n/);
    });

    it("should mention structure preservation for all content types", () => {
      const prompts = getCompressionPrompt("test", 500);
      expect(prompts.system).toContain("Preserve structure and formatting where helpful");
      expect(prompts.system).toContain("JSON keys, code signatures, headings");
    });
  });

  describe("edge cases", () => {
    it("should handle empty content", () => {
      const prompts = getCompressionPrompt("", 500);
      expect(prompts.user).toContain("<document>");
      expect(prompts.user).toContain("</document>");
    });

    it("should handle very long content", () => {
      const longContent = "a".repeat(100000);
      const prompts = getCompressionPrompt(longContent, 500);
      expect(prompts.user).toContain(longContent);
    });

    it("should handle special characters in content", () => {
      const content = '<script>alert("xss")</script>';
      const prompts = getCompressionPrompt(content, 500);
      expect(prompts.user).toContain(content);
    });

    it("should handle special characters in goal", () => {
      const goal = 'Find items with "quotes" and <tags>';
      const prompts = getCompressionPrompt("test", 500, goal);
      expect(prompts.user).toContain(goal);
    });

    it("should handle all parameters together", () => {
      const prompts = getCompressionPrompt(
        "function test() {}",
        750,
        "Find functions",
        "Keep comments"
      );

      expect(prompts.user).toContain("function test()");
      expect(prompts.system).toContain("under 750 tokens");
      expect(prompts.user).toContain("Find functions");
      expect(prompts.system).toContain("Keep comments");
    });
  });
});

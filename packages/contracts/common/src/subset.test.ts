import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ADR-0003 requires contract schemas to stay in the subset that survives
// Zod → JSON Schema generation. .transform(), .refine(), .brand(), and
// .catch() are exactly the constructs the ADR names as not translating: a
// refinement or transform that exists only in Zod is a rule Python silently
// does not enforce, and .brand() produces nominal typing with no JSON
// Schema representation at all (requirements.md §10, AC8).
//
// This inspects source text directly, the same self-inspection technique
// apps/web/src/lib/commands/dispatch.test.ts already uses for its own
// structural boundary (AC8 there is "no import of cartStore"; AC8 here is
// "no use of these four methods").
const FORBIDDEN_PATTERNS = [
  /\.transform\(/,
  /\.refine\(/,
  /\.brand\(/,
  /\.catch\(/,
];

const CONTRACT_SRC_DIRS = ["../src", "../../ui-commands/src", "../../agent-intents/src"];

function nonTestSourceFiles(dirUrl: string): string[] {
  const dirPath = fileURLToPath(new URL(dirUrl, import.meta.url));
  return readdirSync(dirPath)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => `${dirPath}/${name}`);
}

// A comment is allowed to name a discouraged method to explain why it isn't
// used (see ids.ts's note on .brand()) — only a line that survives comment
// stripping is code that could actually call it.
function stripFullLineComments(source: string): string {
  return source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}

describe("contract schemas stay in the JSON-Schema-expressible subset (AC8)", () => {
  const files = CONTRACT_SRC_DIRS.flatMap((dir) => nonTestSourceFiles(dir));

  it("found source files to check", () => {
    // A guard against this test silently checking nothing if the directory
    // layout ever changes.
    expect(files.length).toBeGreaterThan(10);
  });

  for (const file of files) {
    it(`${file.split("/packages/contracts/")[1]} uses no .transform(), .refine(), .brand(), or .catch()`, () => {
      const code = stripFullLineComments(readFileSync(file, "utf8"));
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(code).not.toMatch(pattern);
      }
    });
  }
});

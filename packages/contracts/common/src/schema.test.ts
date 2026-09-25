import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ARTIFACTS, SCHEMA_DIR, render } from "../scripts/emit-schema.ts";

// ADR-0003 requires the generated artifacts to stay in step with their Zod
// source, and says the codegen must run in CI or the guarantee evaporates
// silently. There is no CI, so this test is the enforcement that exists
// (AC7, requirements.md D10). If it fails, run `pnpm --filter
// @contracts/common build` and commit the result.
describe("generated JSON Schema is current (AC7)", () => {
  for (const artifact of ARTIFACTS) {
    it(`schema/${artifact.file} matches its Zod source`, () => {
      const committed = readFileSync(join(SCHEMA_DIR, artifact.file), "utf8");
      expect(committed).toBe(render(artifact));
    });
  }
});

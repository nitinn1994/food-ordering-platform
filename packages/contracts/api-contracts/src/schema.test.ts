import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ARTIFACTS, SCHEMA_DIR, render } from "../scripts/emit-schema.ts";

// See @contracts/common's src/schema.test.ts for the rationale — the
// identical freshness guard for this package's own artifact (AC8).
describe("generated JSON Schema is current (AC8)", () => {
  for (const artifact of ARTIFACTS) {
    it(`schema/${artifact.file} matches its Zod source`, () => {
      const committed = readFileSync(join(SCHEMA_DIR, artifact.file), "utf8");
      expect(committed).toBe(render(artifact));
    });
  }
});

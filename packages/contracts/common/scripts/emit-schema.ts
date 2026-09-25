import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import { contractErrorSchema } from "../src/errors.ts";

// Generates the language-neutral artifacts ADR-0003 requires. The ADR was
// written when this implied a separate zod-to-json-schema dependency; Zod 4
// ships z.toJSONSchema() built in, so this step costs no dependency at all.
//
// The artifacts are committed to the repository and guarded by
// src/schema.test.ts, which regenerates them in memory and fails when a
// committed file has drifted. ADR-0003 asks for codegen in CI; there is no
// CI, so a failing test is the enforcement that actually exists today
// (requirements.md D10).
//
// Nothing here runs on import — the test imports ARTIFACTS and render() to
// compare, and would be vacuous if importing rewrote the files first.

const HERE = dirname(fileURLToPath(import.meta.url));

export const SCHEMA_DIR = join(HERE, "..", "schema");

export type Artifact = {
  file: string;
  id: string;
  schema: z.ZodType;
};

export const ARTIFACTS: readonly Artifact[] = [
  {
    file: "error.v1.json",
    id: "urn:food-ordering-platform:contracts:common:error:v1",
    schema: contractErrorSchema,
  },
];

export function render(artifact: Artifact): string {
  const generated = z.toJSONSchema(artifact.schema, {
    target: "draft-2020-12",
  }) as Record<string, unknown>;
  const { $schema, ...rest } = generated;
  return `${JSON.stringify({ $schema, $id: artifact.id, ...rest }, null, 2)}\n`;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  mkdirSync(SCHEMA_DIR, { recursive: true });
  for (const artifact of ARTIFACTS) {
    writeFileSync(join(SCHEMA_DIR, artifact.file), render(artifact), "utf8");
    console.log(`wrote schema/${artifact.file}`);
  }
}

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import { uiCommandBatchSchema } from "../src/envelope.ts";

// See packages/contracts/common/scripts/emit-schema.ts for the rationale —
// this file follows the identical pattern.

const HERE = dirname(fileURLToPath(import.meta.url));

export const SCHEMA_DIR = join(HERE, "..", "schema");

export type Artifact = {
  file: string;
  id: string;
  schema: z.ZodType;
};

export const ARTIFACTS: readonly Artifact[] = [
  {
    file: "ui-command.v1.json",
    id: "urn:food-ordering-platform:contracts:ui-commands:batch:v1",
    schema: uiCommandBatchSchema,
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

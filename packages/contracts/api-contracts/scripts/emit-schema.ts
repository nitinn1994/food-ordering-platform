import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import {
  addCartItemRequestSchema,
  cartResponseSchema,
  updateCartItemRequestSchema,
} from "../src/cart.ts";
import { menuResponseSchema } from "../src/menu.ts";

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
    file: "menu.v1.json",
    id: "urn:food-ordering-platform:contracts:api-contracts:menu:v1",
    schema: menuResponseSchema,
  },
  // Request schemas are emitted as well as the response, unlike Menu: a
  // Python caller (ai-service) will send these bodies, not just read them
  // (docs/features/phase-8-cart-domain/plan.md §8).
  {
    file: "cart.v1.json",
    id: "urn:food-ordering-platform:contracts:api-contracts:cart:v1",
    schema: cartResponseSchema,
  },
  {
    file: "cart-add-item-request.v1.json",
    id: "urn:food-ordering-platform:contracts:api-contracts:cart-add-item-request:v1",
    schema: addCartItemRequestSchema,
  },
  {
    file: "cart-update-item-request.v1.json",
    id: "urn:food-ordering-platform:contracts:api-contracts:cart-update-item-request:v1",
    schema: updateCartItemRequestSchema,
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

import { z } from "zod";
import { envelopeBaseShape } from "@contracts/common";
import { uiCommandSchema } from "./commands";

// One conversational turn (system-architecture.md §3, step 7) can produce a
// *set* of UI commands — "show me the desserts" might both filter the menu
// and highlight an item. The envelope carries the turn's shared metadata
// once; each command inside it is still validated individually by
// parseBatch, so one malformed command does not discard its valid siblings
// (requirements.md AC5).
//
// Capped at 10: without a bound, a single response could enqueue unlimited
// state changes (requirements.md §24 / AC9).
export const MAX_COMMANDS_PER_BATCH = 10;

export const uiCommandBatchSchema = z.strictObject({
  ...envelopeBaseShape,
  commands: z.array(uiCommandSchema).min(1).max(MAX_COMMANDS_PER_BATCH),
});

export type UiCommandBatch = z.infer<typeof uiCommandBatchSchema>;

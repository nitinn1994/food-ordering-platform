import { z } from "zod";
import { envelopeBaseShape, idempotencyKeySchema } from "@contracts/common";
import { agentIntentSchema } from "./intents";

// One intent per request, deliberately unbatched — unlike a UI command
// batch (requirements.md D4). Each intent is a distinct state change that
// needs its own idempotency key and its own authoritative response from
// commerce-api; bundling several into one envelope would mean one key
// covering several mutations, which is the opposite of what idempotency is
// for.
//
// No cartId: the system is single-user by assumption (CLAUDE.md;
// system-architecture.md §8 gap 4), so cart resolution is commerce-api's
// job, not this contract's (requirements.md D13).
export const agentIntentRequestSchema = z.strictObject({
  ...envelopeBaseShape,
  idempotencyKey: idempotencyKeySchema,
  intent: agentIntentSchema,
});

export type AgentIntentRequest = z.infer<typeof agentIntentRequestSchema>;

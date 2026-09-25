import { z } from "zod";
import { contractVersionSchema } from "./version";
import { correlationIdSchema } from "./ids";

// ISO-8601 UTC on the wire, not epoch milliseconds: unambiguous across
// TypeScript and Python, and readable in a log without conversion. The
// frontend's internal CommandLogEntry.receivedAt stays epoch millis — that is
// internal state, not a wire format. See requirements.md D9.
//
// Known cost, accepted knowingly: z.iso.datetime() renders as a large regex
// in the generated JSON Schema. Recorded in ADR-0012 so the next reader knows
// the noise is deliberate.
export const isoTimestampSchema = z.iso.datetime();

// The fields every envelope carries, defined once so the two envelopes cannot
// drift. Spread into a strict object by each consumer rather than nested, so
// the wire shape stays flat.
export const envelopeBaseShape = {
  contractVersion: contractVersionSchema,
  correlationId: correlationIdSchema,
  issuedAt: isoTimestampSchema,
} as const;

export type IsoTimestamp = z.infer<typeof isoTimestampSchema>;

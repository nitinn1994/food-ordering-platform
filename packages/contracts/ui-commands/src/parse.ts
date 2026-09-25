import { z } from "zod";
import { envelopeBaseShape } from "@contracts/common";
import { uiCommandSchema, type UiCommand } from "./commands";
import { MAX_COMMANDS_PER_BATCH } from "./envelope";

export type ParseResult =
  | { accepted: true; command: UiCommand }
  | { accepted: false; reason: string; received: unknown };

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

// Returns a discriminated result rather than throwing, so a rejection is an
// ordinary value the caller must handle and cannot accidentally swallow.
export function parseCommand(input: unknown): ParseResult {
  const result = uiCommandSchema.safeParse(input);

  if (result.success) {
    return { accepted: true, command: result.data };
  }

  return {
    accepted: false,
    reason: formatIssues(result.error),
    received: input,
  };
}

// The envelope's metadata and array bounds are validated as a whole; each
// element of `commands` is deliberately *not* validated by this schema
// (it accepts z.unknown() here) — parseBatch below validates each command
// individually via parseCommand, so one malformed command among valid ones
// is dropped without discarding its siblings (requirements.md AC5). Validating
// the array with uiCommandSchema directly would reject the whole batch on the
// first bad element, which is the opposite of "dropped and logged"
// (system-architecture.md §4.3).
const batchEnvelopeShape = z.strictObject({
  ...envelopeBaseShape,
  commands: z.array(z.unknown()).min(1).max(MAX_COMMANDS_PER_BATCH),
});

export type BatchCommandResult =
  | { status: "accepted"; command: UiCommand }
  | { status: "rejected"; reason: string; received: unknown };

export type BatchParseResult =
  | {
      accepted: true;
      contractVersion: number;
      correlationId: string;
      issuedAt: string;
      results: BatchCommandResult[];
    }
  | { accepted: false; reason: string; received: unknown };

// Two-stage validation, deliberately (plan.md §8): first the envelope as a
// whole (version, correlation id, timestamp, array bounds), then each command
// on its own. A malformed envelope rejects the whole batch — there is no
// partial turn without a version or a correlation id. A malformed command
// inside a well-formed envelope rejects only that command.
export function parseBatch(input: unknown): BatchParseResult {
  const envelopeResult = batchEnvelopeShape.safeParse(input);

  if (!envelopeResult.success) {
    return {
      accepted: false,
      reason: formatIssues(envelopeResult.error),
      received: input,
    };
  }

  const { commands, ...metadata } = envelopeResult.data;
  const results = commands.map((raw): BatchCommandResult => {
    const result = parseCommand(raw);
    return result.accepted
      ? { status: "accepted", command: result.command }
      : { status: "rejected", reason: result.reason, received: result.received };
  });

  return { accepted: true, ...metadata, results };
}

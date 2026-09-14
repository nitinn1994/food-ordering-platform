import { uiCommandSchema, type UiCommand } from "./commands";

export type ParseResult =
  | { accepted: true; command: UiCommand }
  | { accepted: false; reason: string; received: unknown };

// Returns a discriminated result rather than throwing, so a rejection is an
// ordinary value the caller must handle and cannot accidentally swallow.
export function parseCommand(input: unknown): ParseResult {
  const result = uiCommandSchema.safeParse(input);

  if (result.success) {
    return { accepted: true, command: result.data };
  }

  const reason = result.error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");

  return { accepted: false, reason, received: input };
}

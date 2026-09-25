import { HttpStatus } from "@nestjs/common";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { describe, expect, it } from "vitest";
import { ApiException } from "../errors/api.exception";
import { validationExceptionFactory } from "./validation";

function issue(
  path: readonly (string | number)[],
  message: string,
): StandardSchemaV1.Issue {
  return { path, message };
}

describe("validationExceptionFactory", () => {
  it("returns an ApiException with 400 and INVALID_PAYLOAD for an ordinary shape failure", () => {
    const exception = validationExceptionFactory([
      issue(["intent", "itemId"], "Required"),
    ]);

    expect(exception).toBeInstanceOf(ApiException);
    expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(exception.error.code).toBe("INVALID_PAYLOAD");
    expect(exception.error.field).toBe("intent.itemId");
    expect(exception.error.message).toContain("intent.itemId: Required");
  });

  it("returns UNSUPPORTED_CONTRACT_VERSION when contractVersion itself fails (AC6)", () => {
    const exception = validationExceptionFactory([
      issue(["contractVersion"], "Invalid literal value"),
    ]);

    expect(exception.error.code).toBe("UNSUPPORTED_CONTRACT_VERSION");
    expect(exception.error.field).toBe("contractVersion");
  });

  it("prefers UNSUPPORTED_CONTRACT_VERSION even when contractVersion is not the first issue", () => {
    const exception = validationExceptionFactory([
      issue(["intent", "itemId"], "Required"),
      issue(["contractVersion"], "Invalid literal value"),
    ]);

    expect(exception.error.code).toBe("UNSUPPORTED_CONTRACT_VERSION");
  });

  it("uses (root) for an issue with no path", () => {
    const exception = validationExceptionFactory([issue([], "Expected object")]);

    expect(exception.error.message).toContain("(root): Expected object");
    // No path means no field to report. Omitted entirely, not an empty
    // string — contractErrorSchema's `field` is `min(1).optional()`, so an
    // empty string would fail the very schema this error must satisfy.
    expect(exception.error.field).toBeUndefined();
  });

  it("truncates field to 64 characters", () => {
    const longPath = "x".repeat(100);
    const exception = validationExceptionFactory([issue([longPath], "bad")]);

    expect(exception.error.field).toHaveLength(64);
  });

  it("truncates message to 500 characters", () => {
    const manyIssues = Array.from({ length: 50 }, (_, i) =>
      issue([`field${i}`], "a fairly long validation failure message here"),
    );
    const exception = validationExceptionFactory(manyIssues);

    expect(exception.error.message.length).toBeLessThanOrEqual(500);
  });

  it("never includes an issue's raw input value — only path and message text", () => {
    // Standard Schema issues can carry an `input`-shaped field per-path
    // segment (PathSegment.key), but never the failing value itself; this
    // asserts the factory doesn't reach for anything beyond path + message.
    const secret = "sk_live_marker_9f3a";
    const exception = validationExceptionFactory([
      issue(["password"], `must not equal ${secret}`),
    ]);

    // The message legitimately contains what Zod put in `issue.message`
    // (asserted above); this factory itself never appends anything else,
    // e.g. no `details`/`received` field carrying the original payload.
    expect(exception.error.details).toBeUndefined();
  });
});

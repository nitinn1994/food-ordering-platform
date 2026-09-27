import { describe, expect, it } from "vitest";
import { reportBootstrapFailure } from "./bootstrap-failure";

describe("reportBootstrapFailure (Phase 18 AC9)", () => {
  it("writes one JSON line naming the error and its fixed message", () => {
    const lines: string[] = [];
    reportBootstrapFailure(
      new Error("Database unreachable at startup (code ECONNREFUSED)."),
      (line) => lines.push(line),
    );

    expect(lines).toHaveLength(1);
    expect(lines[0]?.endsWith("\n")).toBe(true);
    expect(JSON.parse(lines[0] ?? "")).toEqual({
      level: "fatal",
      context: "Bootstrap",
      message: "commerce-api failed to start",
      error: "Error",
      reason: "Database unreachable at startup (code ECONNREFUSED).",
    });
  });

  it("leaves out the stack", () => {
    const lines: string[] = [];
    reportBootstrapFailure(new Error("boom"), (line) => lines.push(line));

    expect(lines[0]).not.toContain("at ");
  });

  it("prints nothing of a non-Error rejection value", () => {
    const lines: string[] = [];
    reportBootstrapFailure({ secret: "marker-4d1e" }, (line) => lines.push(line));

    expect(lines[0]).not.toContain("marker-4d1e");
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({ error: "UnknownError" });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { requestContextStorage } from "../request-context/request-context";
import { AppLogger, logLevelsFrom } from "./logger";

// Captures every line AppLogger writes to stdout during `run()`, parsing
// each as JSON. ConsoleLogger with `json: true` writes one JSON.stringify'd
// line (plus a trailing newline) per call via process.stdout.write, not
// console.log — this asserts against that write, not against what a
// terminal happens to display.
function captureJsonLines(run: () => void): Record<string, unknown>[] {
  const writes: string[] = [];
  const spy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });

  try {
    run();
  } finally {
    spy.mockRestore();
  }

  return writes
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("AppLogger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes single-line JSON carrying the active request's ids (AC9)", () => {
    const logger = new AppLogger({ json: true, logLevels: ["log"] });

    const lines = captureJsonLines(() => {
      requestContextStorage.run(
        { requestId: "req-1", correlationId: "corr-1" },
        () => {
          logger.log("request handled", { method: "GET", path: "/health" });
        },
      );
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      message: "request handled",
      requestId: "req-1",
      correlationId: "corr-1",
      method: "GET",
      path: "/health",
    });
  });

  it("omits the ids when logged outside any request context", () => {
    const logger = new AppLogger({ json: true, logLevels: ["log"] });

    const lines = captureJsonLines(() => {
      logger.log("no active request");
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toHaveProperty("requestId");
    expect(lines[0]).not.toHaveProperty("correlationId");
  });

  it("never carries a request body — only whatever a caller explicitly logs", () => {
    const logger = new AppLogger({ json: true, logLevels: ["log"] });

    const lines = captureJsonLines(() => {
      requestContextStorage.run(
        { requestId: "req-1", correlationId: "corr-1" },
        () => {
          logger.log("request handled", { method: "POST", path: "/v1/x" });
        },
      );
    });

    expect(lines[0]).not.toHaveProperty("body");
  });
});

describe("logLevelsFrom", () => {
  it("includes the minimum level and everything more severe", () => {
    expect(logLevelsFrom("warn")).toEqual(["warn", "error", "fatal"]);
  });

  it("includes every level when the minimum is the least severe", () => {
    expect(logLevelsFrom("verbose")).toEqual([
      "verbose",
      "debug",
      "log",
      "warn",
      "error",
      "fatal",
    ]);
  });

  it("includes only the most severe level when the minimum is fatal", () => {
    expect(logLevelsFrom("fatal")).toEqual(["fatal"]);
  });
});

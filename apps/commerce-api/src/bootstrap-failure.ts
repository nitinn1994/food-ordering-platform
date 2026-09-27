// main.ts's last line of defence (Phase 18, plan.md §9 R-5): one JSON line
// on stderr when bootstrap() rejects. Written with a plain stream because a
// failure can come before or during logger setup.
//
// Only the error's name and message are printed. Every startup error this
// service raises carries a fixed message — DatabaseClient's boot check
// names the driver code only, never the URL — and the stack is left out so
// no value from a deeper frame is echoed.
export function reportBootstrapFailure(
  error: unknown,
  write: (line: string) => void = (line) => process.stderr.write(line),
): void {
  const detail =
    error instanceof Error
      ? { error: error.name, reason: error.message }
      : { error: "UnknownError" };
  write(
    `${JSON.stringify({
      level: "fatal",
      context: "Bootstrap",
      message: "commerce-api failed to start",
      ...detail,
    })}\n`,
  );
}

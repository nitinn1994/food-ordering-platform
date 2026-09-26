// The idempotency key for one POST /v1/orders submission — plan.md §5,
// OD12. Created once per review of a set of customer details and reused
// for every retry of that submission, so a retry after a timeout replays
// the original order instead of creating a second one
// (docs/api/commerce-api.md §13).
//
// `generate` is injectable so tests are deterministic, the same pattern
// Phase 4's (since deleted) createOrderId used.

export function createIdempotencyKey(
  generate: () => string = randomKey,
): string {
  return generate();
}

// crypto.randomUUID only exists in a secure context (https, localhost,
// 127.0.0.1). getRandomValues exists everywhere, so the fallback keeps
// checkout working when the dev server is opened over a LAN address.
function randomKey(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

// A locally generated, obviously-mock order reference — not an
// authoritative order id. See lib/checkout/order.ts's header comment for
// where the real violation this stands in for is recorded (ADR-0011).
//
// `random` is injectable so tests are deterministic (D8,
// docs/features/phase-4-frontend-checkout-simulation/plan.md) — Math.random
// is the default, used only inside an event handler at submit time, never
// during render.

const PREFIX = "ORD-";
const ID_LENGTH = 6;
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function createOrderId(random: () => number = Math.random): string {
  let suffix = "";
  for (let i = 0; i < ID_LENGTH; i += 1) {
    const index = Math.min(
      ALPHABET.length - 1,
      Math.floor(random() * ALPHABET.length),
    );
    suffix += ALPHABET[index];
  }
  return `${PREFIX}${suffix}`;
}

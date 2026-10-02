import type { Nudge, NudgeSurface } from "@contracts/api-contracts";

// The session guardrails for nudges (docs/features/mcdelivery-redesign/
// requirements.md AC-N5): presentation policy only, client-side, per browser
// session (plan.md OQ4). Pure, so every rule is a plain test.
//
// - At most MAX_NUDGES_PER_SESSION different items are ever offered.
// - Each item is offered once: on the surface where it first appeared, it
//   may keep showing (the cart card re-rendering is the same offer); on any
//   other surface it is not offered again.
// - Dismissed or accepted means never again this session.
//
// One exception: a nudge the assistant has just *said* out loud
// (ShowNudge) skips the cap and the once-per-item rule — the screen must
// match what was spoken. A dismissed item is still never shown.
export const MAX_NUDGES_PER_SESSION = 3;

export type NudgeSessionState = {
  // itemId → the surface it was first offered on.
  readonly offered: Readonly<Record<string, NudgeSurface>>;
  readonly closed: readonly string[];
};

export const EMPTY_NUDGE_SESSION: NudgeSessionState = { offered: {}, closed: [] };

export type OfferDecision = { show: boolean; next: NudgeSessionState };

export function decideOffer(
  state: NudgeSessionState,
  nudge: Pick<Nudge, "itemId" | "surface">,
  options: { spoken?: boolean } = {},
): OfferDecision {
  if (state.closed.includes(nudge.itemId)) {
    return { show: false, next: state };
  }
  const firstSurface = state.offered[nudge.itemId];
  if (firstSurface !== undefined) {
    return { show: options.spoken === true || firstSurface === nudge.surface, next: state };
  }
  if (!options.spoken && Object.keys(state.offered).length >= MAX_NUDGES_PER_SESSION) {
    return { show: false, next: state };
  }
  return {
    show: true,
    next: { ...state, offered: { ...state.offered, [nudge.itemId]: nudge.surface } },
  };
}

// Dismissed ("No thanks") and accepted ("Add") both close an item for the
// session: either way, asking again would be nagging.
export function closeItem(state: NudgeSessionState, itemId: string): NudgeSessionState {
  return state.closed.includes(itemId) ? state : { ...state, closed: [...state.closed, itemId] };
}

// Session persistence. sessionStorage can be missing or throw (private
// mode, blocked storage); the policy then simply starts fresh.
const STORAGE_KEY = "nudge-session:v1";

export function loadNudgeSession(storage: Storage | undefined): NudgeSessionState {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_NUDGE_SESSION;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "offered" in parsed &&
      "closed" in parsed &&
      typeof parsed.offered === "object" &&
      parsed.offered !== null &&
      Array.isArray(parsed.closed) &&
      parsed.closed.every((id): id is string => typeof id === "string")
    ) {
      return {
        offered: parsed.offered as Record<string, NudgeSurface>,
        closed: parsed.closed,
      };
    }
  } catch {
    // Fall through to a fresh session.
  }
  return EMPTY_NUDGE_SESSION;
}

export function saveNudgeSession(storage: Storage | undefined, state: NudgeSessionState): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Not persisting only means the caps reset on reload.
  }
}

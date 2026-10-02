import { describe, expect, it } from "vitest";
import {
  closeItem,
  decideOffer,
  EMPTY_NUDGE_SESSION,
  loadNudgeSession,
  MAX_NUDGES_PER_SESSION,
  saveNudgeSession,
  type NudgeSessionState,
} from "./nudgeSession";

// requirements.md AC-N5.
function offer(state: NudgeSessionState, itemId: string, surface = "cart" as const) {
  return decideOffer(state, { itemId, surface });
}

describe("decideOffer", () => {
  it("offers a new item and records where it was first offered", () => {
    const { show, next } = offer(EMPTY_NUDGE_SESSION, "fries");
    expect(show).toBe(true);
    expect(next.offered).toEqual({ fries: "cart" });
  });

  it("keeps showing the same item on the same surface, without counting it again", () => {
    const first = offer(EMPTY_NUDGE_SESSION, "fries").next;
    const again = offer(first, "fries");
    expect(again).toEqual({ show: true, next: first });
  });

  it("does not offer an item a second time on another surface", () => {
    const first = offer(EMPTY_NUDGE_SESSION, "fries").next;
    expect(decideOffer(first, { itemId: "fries", surface: "post-add" }).show).toBe(false);
  });

  it(`offers at most ${MAX_NUDGES_PER_SESSION} different items per session`, () => {
    let state = EMPTY_NUDGE_SESSION;
    for (const item of ["a", "b", "c"]) {
      const decision = offer(state, item);
      expect(decision.show).toBe(true);
      state = decision.next;
    }
    expect(offer(state, "d")).toEqual({ show: false, next: state });
  });

  it("never offers a dismissed or accepted item again", () => {
    const closed = closeItem(offer(EMPTY_NUDGE_SESSION, "fries").next, "fries");
    expect(offer(closed, "fries").show).toBe(false);
    expect(decideOffer(closed, { itemId: "fries", surface: "voice" }, { spoken: true }).show).toBe(
      false,
    );
  });

  it("shows what the assistant just said, past the cap and on another surface", () => {
    let state = EMPTY_NUDGE_SESSION;
    for (const item of ["a", "b", "c"]) state = offer(state, item).next;
    expect(decideOffer(state, { itemId: "d", surface: "voice" }, { spoken: true }).show).toBe(true);
    expect(decideOffer(state, { itemId: "a", surface: "voice" }, { spoken: true }).show).toBe(true);
  });
});

describe("session persistence", () => {
  function memoryStorage(initial: Record<string, string> = {}): Storage {
    const data = new Map(Object.entries(initial));
    return {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => void data.set(key, value),
      removeItem: (key) => void data.delete(key),
      clear: () => data.clear(),
      key: () => null,
      get length() {
        return data.size;
      },
    };
  }

  it("round-trips the state", () => {
    const storage = memoryStorage();
    const state = closeItem(offer(EMPTY_NUDGE_SESSION, "fries").next, "cola");
    saveNudgeSession(storage, state);
    expect(loadNudgeSession(storage)).toEqual(state);
  });

  it("starts fresh on missing, corrupt or wrongly shaped data, and on a throwing storage", () => {
    expect(loadNudgeSession(undefined)).toEqual(EMPTY_NUDGE_SESSION);
    expect(loadNudgeSession(memoryStorage({ "nudge-session:v1": "{not json" }))).toEqual(
      EMPTY_NUDGE_SESSION,
    );
    expect(
      loadNudgeSession(memoryStorage({ "nudge-session:v1": '{"offered":{},"closed":[1]}' })),
    ).toEqual(EMPTY_NUDGE_SESSION);
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    expect(loadNudgeSession(throwing)).toEqual(EMPTY_NUDGE_SESSION);
    expect(() => saveNudgeSession(throwing, EMPTY_NUDGE_SESSION)).not.toThrow();
  });
});

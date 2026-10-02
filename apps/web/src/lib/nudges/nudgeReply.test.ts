import { describe, expect, it } from "vitest";
import { resolveNudgeReply } from "./nudgeReply";

describe("resolveNudgeReply (AC-V4)", () => {
  it.each(["yes", "Yes.", "yeah", "Sure!", "add it", "  OK  ", "yes please"])(
    "accepts %j",
    (phrase) => {
      expect(resolveNudgeReply(phrase)).toBe("accept");
    },
  );

  it.each(["no", "No thanks.", "nope", "not now", "no thank you"])("dismisses %j", (phrase) => {
    expect(resolveNudgeReply(phrase)).toBe("dismiss");
  });

  it.each(["yes add two burgers", "add fries", "no wait, show desserts", "maybe", "", "yesterday"])(
    "treats %j as an ordinary request",
    (phrase) => {
      expect(resolveNudgeReply(phrase)).toBe("other");
    },
  );
});

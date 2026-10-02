// The spoken answer to a spoken suggestion (docs/features/mcdelivery-
// redesign/requirements.md AC-V4, plan.md OQ5 (a)). A closed word list, not
// language understanding: a short "yes" or "no" right after the assistant
// offered something is mapped onto the same choice as pressing that
// suggestion's "Add" or "No thanks". Anything else is an ordinary turn.

export type NudgeReply = "accept" | "dismiss" | "other";

const ACCEPT = new Set(["yes", "yeah", "yep", "sure", "ok", "okay", "add it", "yes please", "please do"]);
const DISMISS = new Set(["no", "nope", "no thanks", "no thank you", "not now", "skip it"]);

export function resolveNudgeReply(transcript: string): NudgeReply {
  const phrase = transcript
    .toLowerCase()
    .replace(/[.,!?]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (ACCEPT.has(phrase)) return "accept";
  if (DISMISS.has(phrase)) return "dismiss";
  return "other";
}

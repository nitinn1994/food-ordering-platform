// TEMPORARY — stands in for apps/ai-service. Produces hardcoded output that
// is deliberately typed `unknown`, exactly as a real agent's response would
// be: untrusted until it passes through parseCommand. See
// docs/product/food-ordering-frontend-mvp.md §7.
//
// The two "__..._command__" phrases are adversarial test hooks, not real
// chat phrases — they exist so the rejection path (AC4, AC5) is reachable
// from the actual UI, not just from unit tests.
//
// Returns `undefined` when no command was produced at all, which is a
// different case from a command that was produced but rejected — see
// docs/features/phase-1-web-foundation/requirements.md, Open questions.

export function simulateCommand(utterance: string): unknown {
  const text = utterance.trim().toLowerCase();

  if (text.includes("__unknown_command__")) {
    return { type: "DeleteAllOrders", itemId: "x" };
  }
  if (text.includes("__malformed_command__")) {
    return { type: "ShowMenuCategory" }; // missing categoryId
  }

  if (text.startsWith("search for ")) {
    return { type: "SearchMenu", query: text.slice("search for ".length) };
  }
  if (text.startsWith("find ")) {
    return { type: "SearchMenu", query: text.slice("find ".length) };
  }

  // Checked before the "tiramisu" HighlightItem trigger below, so "tiramisu
  // details" resolves to the detail panel rather than just a highlight.
  if (text.includes("detail")) {
    return { type: "ShowItemDetail", itemId: "tiramisu" };
  }

  if (text.includes("dessert")) {
    return { type: "ShowMenuCategory", categoryId: "desserts" };
  }
  if (text.includes("starter")) {
    return { type: "ShowMenuCategory", categoryId: "starters" };
  }
  if (text.includes("main")) {
    return { type: "ShowMenuCategory", categoryId: "mains" };
  }
  if (text.includes("tiramisu")) {
    return { type: "HighlightItem", itemId: "tiramisu" };
  }
  if (text.includes("cart")) {
    return { type: "OpenCartPanel", open: true };
  }

  return undefined;
}

"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useAgentTurn, type AgentTurn } from "./useAgentTurn";

// One conversational turn for the whole app (docs/features/
// mcdelivery-redesign/plan.md, Phase 5): the chat on the menu page and the
// voice sheet in the header are two inputs to the same turn, transcript and
// one-turn-in-flight guard — still exactly one turn path (ADR-0023 rule 2).
// Mounted in the root layout. Without it (a component rendered alone, as in
// the Phase 15–16 tests) ChatInput falls back to its own useAgentTurn.
const AgentTurnContext = createContext<AgentTurn | null>(null);

export function AgentTurnProvider({ children }: { children: ReactNode }) {
  const turn = useAgentTurn();
  return <AgentTurnContext.Provider value={turn}>{children}</AgentTurnContext.Provider>;
}

export function useSharedAgentTurn(): AgentTurn | null {
  return useContext(AgentTurnContext);
}

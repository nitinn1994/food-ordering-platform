import type { CartOwnerId } from "./cart.types";

// Decides whose cart a request acts on — the only place cart identity comes
// from (docs/features/phase-8-cart-domain/plan.md §5, OD3; requirements.md
// AC10). Nothing in a request's path, body, query, or headers is ever read
// as a cart or owner id.
//
// The Phase 8 adapter returns one fixed owner: the system is single-user
// (CLAUDE.md; Phase 5 D13), and pretending otherwise with an
// unauthenticated client-supplied id would look like isolation without
// being it (system-architecture.md §8 gap 4). The authentication phase
// replaces the binding — e.g. owner = authenticated subject — and nothing
// else changes. Async so that replacement can do a lookup.
export abstract class CartOwnerResolver {
  abstract resolve(): Promise<CartOwnerId>;
}

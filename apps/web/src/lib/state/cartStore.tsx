"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CartResponse } from "@contracts/api-contracts";
import {
  addCartItem,
  getCart,
  removeCartItem,
  setCartItemQuantity,
} from "../cart/cartService";
import { ApiError } from "../api/errors";
import { COMMERCE_ERROR_CODES, userMessageFor } from "../api/userMessages";

// The cart as commerce-api last confirmed it — a holder of server state, not
// a store of its own. docs/features/phase-11-web-commerce-integration/
// plan.md §4, §7 (OD2).
//
// The only commerce data here is the last CartResponse body, replaced
// wholesale by each response and never edited locally: no reducer computes
// lines, nothing prices anything, and nothing changes on screen until the
// backend has answered (no optimistic updates, OD7). Everything else is
// request metadata — whether the cart has loaded, which mutation is in
// flight, and the last failure.
//
// Still lives in app/layout.tsx, above routing, so the same instance
// survives navigation (ADR-0010). There is no clearCart: the backend has no
// such route by design (ADR-0011, Phase 8 OD5), and a placed order empties
// the cart server-side — a caller then refresh()es (plan.md OD3).
//
// lib/commands/dispatch.ts still has no import of this module: a UI command
// can never reach cart state (system-architecture.md §4.4).

export type CartStatus = "loading" | "ready" | "error";

export type CartOperation = "add" | "setQuantity" | "remove";

export type PendingCartOp = { op: CartOperation; itemId: string };

type CartContextValue = {
  cart: CartResponse | null;
  status: CartStatus;
  pending: PendingCartOp | null;
  // User-facing copy for the last failure, chosen by code/kind only
  // (lib/api/userMessages.ts) — never a backend message.
  errorMessage: string | null;
  itemCount: number;
  addItem: (itemId: string) => void;
  setQuantity: (itemId: string, quantity: number) => void;
  removeItem: (itemId: string) => void;
  refresh: () => Promise<void>;
  dismissError: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

// A remove of a line that is already gone is the outcome the user asked
// for — not an error worth showing (plan.md §11).
function isSilentFailure(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.code === COMMERCE_ERROR_CODES.CART_ITEM_NOT_FOUND
  );
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartResponse | null>(null);
  const [status, setStatus] = useState<CartStatus>("loading");
  const [pending, setPending] = useState<PendingCartOp | null>(null);
  const [error, setError] = useState<unknown>(null);
  // Guards synchronously, unlike `pending`: two clicks in the same frame
  // both see pending === null, but not this ref — so a second concurrent
  // mutation is impossible, not merely unlikely (plan.md OD6, AC6).
  const inFlight = useRef(false);
  // Every cart request (load or mutation) takes the next number when it is
  // sent; a response is applied only if no later-sent request's response has
  // been applied already. Responses on separate connections can arrive out
  // of order — without this, an initial GET answering after an "Add to cart"
  // POST would replace the newer cart with the older one (review finding #1).
  const lastIssued = useRef(0);
  const lastApplied = useRef(0);

  const claim = useCallback(() => {
    lastIssued.current += 1;
    return lastIssued.current;
  }, []);

  // True if this response may be applied (and records that it was).
  const accept = useCallback((sequence: number) => {
    if (sequence < lastApplied.current) {
      return false;
    }
    lastApplied.current = sequence;
    return true;
  }, []);

  const load = useCallback(async () => {
    const sequence = claim();
    try {
      const next = await getCart();
      if (!accept(sequence)) {
        return;
      }
      setCart(next);
      setStatus("ready");
    } catch (loadError) {
      if (!accept(sequence)) {
        return;
      }
      setError(loadError);
      // A cart already on screen stays — it is still the last state the
      // backend confirmed. Only a first load that fails is an error state.
      setStatus((current) => (current === "ready" ? "ready" : "error"));
    }
  }, [claim, accept]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    setError(null);
    setStatus((current) => (current === "error" ? "loading" : current));
    await load();
  }, [load]);

  const mutate = useCallback(
    async (
      op: CartOperation,
      itemId: string,
      call: () => Promise<CartResponse>,
    ) => {
      if (inFlight.current) {
        return;
      }
      inFlight.current = true;
      setPending({ op, itemId });
      setError(null);
      const sequence = claim();
      try {
        const next = await call();
        if (accept(sequence)) {
          setCart(next);
          setStatus("ready");
        }
      } catch (mutationError) {
        if (accept(sequence) && !isSilentFailure(mutationError)) {
          setError(mutationError);
        }
        // Never retried automatically (plan.md §13). Whatever went wrong —
        // a business refusal, a conflict, or a network failure that leaves
        // the outcome unknown — the cart is re-read rather than guessed
        // (plan.md §10). Controls stay disabled until it has been.
        await load();
      } finally {
        inFlight.current = false;
        setPending(null);
      }
    },
    [load, claim, accept],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      status,
      pending,
      errorMessage: error === null ? null : userMessageFor(error, "cart"),
      itemCount: cart?.itemCount ?? 0,
      addItem: (itemId: string) =>
        void mutate("add", itemId, () => addCartItem(itemId, 1)),
      setQuantity: (itemId: string, quantity: number) =>
        void mutate("setQuantity", itemId, () =>
          setCartItemQuantity(itemId, quantity),
        ),
      removeItem: (itemId: string) =>
        void mutate("remove", itemId, () => removeCartItem(itemId)),
      refresh,
      dismissError: () => setError(null),
    }),
    [cart, status, pending, error, mutate, refresh],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}

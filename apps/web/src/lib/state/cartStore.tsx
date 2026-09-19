"use client";

import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { MAX_LINE_QUANTITY, cartItemCount } from "../cart/pricing";

// TEMPORARY — client-side cart state. Replaced by commerce-api cart
// ownership. See docs/product/food-ordering-frontend-mvp.md §7, item 2.
//
// Holds only cart lines and their mutations — no pricing and no menu
// dependency, so this provider can live above routing (see app/layout.tsx)
// without coupling cart state to how menu data is fetched. Pricing is
// derived from (lines, categories) by pure functions in lib/cart/pricing.ts,
// which is where the temporary client-side pricing violation
// (docs/product/food-ordering-frontend-mvp.md §7, item 3) now lives.
//
// CLEAR_CART exists for Phase 4's frontend checkout simulation, which
// empties the cart after a simulated order is placed — see
// docs/features/phase-4-frontend-checkout-simulation/plan.md. It is not a
// user-facing "clear cart" control; nothing in the cart UI calls it.

export type CartLine = {
  itemId: string;
  quantity: number;
};

export type CartState = {
  lines: CartLine[];
};

export type CartAction =
  | { type: "ADD_ITEM"; itemId: string }
  | { type: "REMOVE_ITEM"; itemId: string }
  | { type: "DECREMENT_ITEM"; itemId: string }
  | { type: "CLEAR_CART" };

export const initialCartState: CartState = { lines: [] };

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "ADD_ITEM": {
      const existing = state.lines.find(
        (line) => line.itemId === action.itemId,
      );
      if (existing) {
        if (existing.quantity >= MAX_LINE_QUANTITY) {
          return state;
        }
        return {
          lines: state.lines.map((line) =>
            line.itemId === action.itemId
              ? { ...line, quantity: line.quantity + 1 }
              : line,
          ),
        };
      }
      return {
        lines: [...state.lines, { itemId: action.itemId, quantity: 1 }],
      };
    }
    case "DECREMENT_ITEM":
      // Never reaches 0 — removal is Remove's job, not a decrement side
      // effect (docs/features/phase-3-frontend-cart-simulation/plan.md, Q5).
      return {
        lines: state.lines.map((line) =>
          line.itemId === action.itemId && line.quantity > 1
            ? { ...line, quantity: line.quantity - 1 }
            : line,
        ),
      };
    case "REMOVE_ITEM":
      return {
        lines: state.lines.filter((line) => line.itemId !== action.itemId),
      };
    case "CLEAR_CART":
      return { lines: [] };
    default:
      return state;
  }
}

type CartContextValue = {
  lines: CartLine[];
  itemCount: number;
  addItem: (itemId: string) => void;
  decrementItem: (itemId: string) => void;
  removeItem: (itemId: string) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, initialCartState);

  const value = useMemo<CartContextValue>(
    () => ({
      lines: state.lines,
      itemCount: cartItemCount(state.lines),
      addItem: (itemId: string) => dispatch({ type: "ADD_ITEM", itemId }),
      decrementItem: (itemId: string) =>
        dispatch({ type: "DECREMENT_ITEM", itemId }),
      removeItem: (itemId: string) =>
        dispatch({ type: "REMOVE_ITEM", itemId }),
      clearCart: () => dispatch({ type: "CLEAR_CART" }),
    }),
    [state],
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

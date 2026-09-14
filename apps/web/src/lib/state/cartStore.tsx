"use client";

import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { MenuCategory, MenuItem } from "../fixtures/menu";
import { findMenuItemIn } from "../menu/menuSource";
import { sumCents } from "../money";

// TEMPORARY — client-side cart state. Replaced by commerce-api cart
// ownership. See docs/product/food-ordering-frontend-mvp.md §7, item 2.
//
// computeCartTotalCents prices the cart from already-resolved menu data
// (passed in by whoever mounts CartProvider — see page.tsx), never from the
// fixture directly (AC6). This is still the one place the MVP knowingly
// violates the authority model (docs/architecture/system-architecture.md
// §5) because there is no backend yet — see
// docs/product/food-ordering-frontend-mvp.md §7, item 3. It must not
// survive past this phase without a comment like this one.

export type CartLine = {
  itemId: string;
  quantity: number;
};

export type CartState = {
  lines: CartLine[];
};

export type CartAction =
  | { type: "ADD_ITEM"; itemId: string }
  | { type: "REMOVE_ITEM"; itemId: string };

export const initialCartState: CartState = { lines: [] };

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "ADD_ITEM": {
      const existing = state.lines.find(
        (line) => line.itemId === action.itemId,
      );
      if (existing) {
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
    case "REMOVE_ITEM":
      return {
        lines: state.lines.filter((line) => line.itemId !== action.itemId),
      };
    default:
      return state;
  }
}

export function computeCartTotalCents(
  lines: readonly CartLine[],
  categories: readonly MenuCategory[],
): number {
  const lineCents = lines.map((line) => {
    const item = findMenuItemIn(categories, line.itemId);
    return item ? item.priceCents * line.quantity : 0;
  });
  return sumCents(lineCents);
}

type CartContextValue = {
  lines: CartLine[];
  totalCents: number;
  addItem: (itemId: string) => void;
  removeItem: (itemId: string) => void;
  findItem: (itemId: string) => MenuItem | undefined;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({
  children,
  categories,
}: {
  children: ReactNode;
  categories: readonly MenuCategory[];
}) {
  const [state, dispatch] = useReducer(cartReducer, initialCartState);

  const value = useMemo<CartContextValue>(
    () => ({
      lines: state.lines,
      totalCents: computeCartTotalCents(state.lines, categories),
      addItem: (itemId: string) => dispatch({ type: "ADD_ITEM", itemId }),
      removeItem: (itemId: string) => dispatch({ type: "REMOVE_ITEM", itemId }),
      findItem: (itemId: string) => findMenuItemIn(categories, itemId),
    }),
    [state, categories],
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

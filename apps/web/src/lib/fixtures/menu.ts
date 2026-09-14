// TEMPORARY — replaced by commerce-api menu reads. See
// docs/product/food-ordering-frontend-mvp.md §7, item 1. This shape is a
// starting point for the real menu API, not a commitment to it.
//
// dietaryTags/allergens/calories/longDescription are display-only
// enrichment for the item detail panel (Phase 2) — they carry no pricing
// weight, so they don't compound the temporary pricing violation flagged
// above them in cartStore.tsx.

export type MenuItem = {
  id: string;
  name: string;
  description: string;
  longDescription: string;
  priceCents: number;
  available: boolean;
  dietaryTags: string[];
  allergens: string[];
  calories: number;
};

export type MenuCategory = {
  id: string;
  name: string;
  items: MenuItem[];
};

export const MENU: readonly MenuCategory[] = [
  {
    id: "starters",
    name: "Starters",
    items: [
      {
        id: "garlic-bread",
        name: "Garlic Bread",
        description: "Toasted sourdough, roasted garlic butter.",
        longDescription:
          "Thick-cut sourdough, brushed with slow-roasted garlic butter and " +
          "toasted until golden. Finished with flaky sea salt and parsley.",
        priceCents: 595,
        available: true,
        dietaryTags: ["vegetarian"],
        allergens: ["gluten", "dairy"],
        calories: 320,
      },
      {
        id: "soup-of-the-day",
        name: "Soup of the Day",
        description: "Ask about today's selection.",
        longDescription:
          "A rotating seasonal soup, made fresh each morning. Ask your server " +
          "what's in the pot today — recipes and allergens change daily.",
        priceCents: 695,
        available: true,
        dietaryTags: [],
        allergens: [],
        calories: 210,
      },
    ],
  },
  {
    id: "mains",
    name: "Mains",
    items: [
      {
        id: "margherita-pizza",
        name: "Margherita Pizza",
        description: "San Marzano tomato, fresh mozzarella, basil.",
        longDescription:
          "Hand-stretched dough, San Marzano tomato sauce, fresh mozzarella, " +
          "and torn basil, baked until the crust blisters.",
        priceCents: 1450,
        available: true,
        dietaryTags: ["vegetarian"],
        allergens: ["gluten", "dairy"],
        calories: 780,
      },
      {
        id: "veggie-burger",
        name: "Veggie Burger",
        description: "House patty, aged cheddar, pickles.",
        longDescription:
          "A house-made vegetable and bean patty, aged cheddar, pickles, and " +
          "our burger sauce on a toasted brioche bun.",
        priceCents: 1295,
        available: true,
        dietaryTags: ["vegetarian"],
        allergens: ["gluten", "dairy", "egg"],
        calories: 690,
      },
    ],
  },
  {
    id: "desserts",
    name: "Desserts",
    items: [
      {
        id: "tiramisu",
        name: "Tiramisu",
        description: "Espresso-soaked ladyfingers, mascarpone.",
        longDescription:
          "Espresso-soaked ladyfingers layered with mascarpone cream, dusted " +
          "with cocoa. Made in-house, rested overnight.",
        priceCents: 750,
        available: true,
        dietaryTags: ["vegetarian"],
        allergens: ["gluten", "dairy", "egg"],
        calories: 450,
      },
      {
        id: "gelato",
        name: "Gelato",
        description: "Ask about today's flavours.",
        longDescription:
          "Small-batch gelato, churned daily. Flavours rotate — ask your " +
          "server what's available, including today's dairy-free option.",
        priceCents: 550,
        available: false,
        dietaryTags: [],
        allergens: ["dairy"],
        calories: 310,
      },
    ],
  },
];

export function findMenuItem(itemId: string): MenuItem | undefined {
  for (const category of MENU) {
    const item = category.items.find((candidate) => candidate.id === itemId);
    if (item) {
      return item;
    }
  }
  return undefined;
}

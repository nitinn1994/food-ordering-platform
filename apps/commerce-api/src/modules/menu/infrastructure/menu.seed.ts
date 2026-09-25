import type { MenuCategory } from "../domain/menu.types";

// TEMPORARY duplicate of apps/web/src/lib/fixtures/menu.ts, plus categoryId
// on each item — commerce-api may not import apps/web (ESLint boundary,
// ADR-0013), so this is a copy, not a shared module. It stays temporary
// until the web integration phase deletes the fixture and apps/web reads
// this menu from GET /v1/menu instead (plan.md §10, ADR-0014).
//
// Only infrastructure/ imports this file — domain and the service layer
// depend on MenuRepository, never on this data directly (requirements.md
// AC5).
export const MENU_SEED: readonly MenuCategory[] = [
  {
    id: "starters",
    name: "Starters",
    items: [
      {
        id: "garlic-bread",
        categoryId: "starters",
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
        categoryId: "starters",
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
        categoryId: "mains",
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
        categoryId: "mains",
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
        categoryId: "desserts",
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
        categoryId: "desserts",
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

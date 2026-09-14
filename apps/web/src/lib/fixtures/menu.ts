// TEMPORARY — replaced by commerce-api menu reads. See
// docs/product/food-ordering-frontend-mvp.md §7, item 1. This shape is a
// starting point for the real menu API, not a commitment to it.

export type MenuItem = {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  available: boolean;
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
        priceCents: 595,
        available: true,
      },
      {
        id: "soup-of-the-day",
        name: "Soup of the Day",
        description: "Ask about today's selection.",
        priceCents: 695,
        available: true,
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
        priceCents: 1450,
        available: true,
      },
      {
        id: "veggie-burger",
        name: "Veggie Burger",
        description: "House patty, aged cheddar, pickles.",
        priceCents: 1295,
        available: true,
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
        priceCents: 750,
        available: true,
      },
      {
        id: "gelato",
        name: "Gelato",
        description: "Ask about today's flavours.",
        priceCents: 550,
        available: false,
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

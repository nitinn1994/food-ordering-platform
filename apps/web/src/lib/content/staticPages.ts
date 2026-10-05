// Original placeholder copy for the static pages (docs/features/
// mcdelivery-parity/plan.md, Phase 4; AC11). None of it is the reference
// site's text, and none of it is legal advice: this is a demo application.
export type FaqTopic = {
  id: string;
  title: string;
  questions: readonly { question: string; answer: string }[];
};

export const FAQ_TOPICS: readonly FaqTopic[] = [
  {
    id: "ordering",
    title: "Ordering",
    questions: [
      {
        question: "How do I place an order?",
        answer:
          "Add items from the menu, open your cart and choose Proceed to checkout. You can also tap the microphone and say what you would like.",
      },
      {
        question: "Can I order by voice?",
        answer:
          "Yes. Tap the microphone, say something like “add a veg burger”, and the assistant updates your cart. Everything it does is shown on screen so you can check it.",
      },
      {
        question: "Can I change my order after placing it?",
        answer: "Not in this demo. Check your cart before you confirm.",
      },
    ],
  },
  {
    id: "delivery",
    title: "Delivery",
    questions: [
      {
        question: "Where do you deliver?",
        answer:
          "This is a demo application, so nothing is delivered. Restaurant locations shown are sample data.",
      },
      {
        question: "Can I pick my order up instead?",
        answer: "Take Away is not available in this demo yet.",
      },
    ],
  },
  {
    id: "payments",
    title: "Payments",
    questions: [
      {
        question: "How do I pay?",
        answer: "No payment is taken in this demo. Orders are simulated.",
      },
      {
        question: "Can I use a coupon?",
        answer: "Offers are shown for illustration only and cannot be redeemed.",
      },
    ],
  },
  {
    id: "account",
    title: "Account",
    questions: [
      {
        question: "Do I need an account?",
        answer: "No. Sign-in is not available in this demo; you order as a guest.",
      },
    ],
  },
];

export type StaticPage = {
  title: string;
  intro: string;
  sections: readonly { heading: string; body: string }[];
};

export const ABOUT_PAGE: StaticPage = {
  title: "About Us",
  intro: "QuickServe is a demo food-ordering app you can use by voice, text or touch.",
  sections: [
    {
      heading: "What we are building",
      body: "A fast, friendly way to order: browse a familiar menu, or just say what you want and watch your cart update.",
    },
    {
      heading: "How the assistant works",
      body: "The assistant suggests and explains; the cart on screen is always the one the store has confirmed.",
    },
  ],
};

export const PRIVACY_PAGE: StaticPage = {
  title: "Privacy Policy",
  intro: "This demo collects as little as it can.",
  sections: [
    {
      heading: "What we store",
      body: "Your cart and any orders you place, kept by the demo store. There are no accounts: the demo assumes a single shopper. Recent searches stay in your own browser.",
    },
    {
      heading: "Voice",
      body: "Speech recognition is your browser's own, under your browser's terms. Only the resulting text is sent to the assistant.",
    },
    {
      heading: "What we never ask for",
      body: "No sign-in, no phone number, no payment details and no location.",
    },
  ],
};

export const TERMS_PAGE: StaticPage = {
  title: "Terms & Conditions",
  intro: "QuickServe is a demonstration. Nothing ordered here is prepared, delivered or charged.",
  sections: [
    {
      heading: "Prices and offers",
      body: "Prices and offers are sample data for illustration only.",
    },
    {
      heading: "Availability",
      body: "Items and restaurants shown may change at any time while the demo is developed.",
    },
  ],
};

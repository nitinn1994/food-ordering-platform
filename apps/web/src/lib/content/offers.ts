// Demo coupon cards for /offers (docs/features/mcdelivery-parity/
// requirements.md OQ3 (a), AC9). Display only: nothing reads these to price
// anything, and the page says they cannot be redeemed. commerce-api has no
// offers, so a real list would come from there first.
export type DemoOffer = {
  code: string;
  title: string;
  description: string;
  minCartCents: number;
};

export const DEMO_OFFERS: readonly DemoOffer[] = [
  {
    code: "WELCOME50",
    title: "₹50 off your first order",
    description: "A welcome treat for new customers.",
    minCartCents: 29_900,
  },
  {
    code: "BREKKIE",
    title: "Free hash brown with breakfast",
    description: "Any breakfast muffin, before 11 am.",
    minCartCents: 19_900,
  },
  {
    code: "MEAL2",
    title: "Second value meal at half price",
    description: "Pick any two value meals.",
    minCartCents: 49_800,
  },
  {
    code: "SWEET20",
    title: "20% off desserts",
    description: "Sundaes, cones and pies.",
    minCartCents: 14_900,
  },
  {
    code: "FAMILY",
    title: "₹120 off family orders",
    description: "For big orders shared around the table.",
    minCartCents: 99_900,
  },
  {
    code: "COFFEE",
    title: "Buy one coffee, get one free",
    description: "Any hot coffee, all day.",
    minCartCents: 24_900,
  },
];

// Case-insensitive match on code, title and description.
export function filterOffers(offers: readonly DemoOffer[], query: string): DemoOffer[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [...offers];
  return offers.filter((offer) =>
    [offer.code, offer.title, offer.description].some((field) =>
      field.toLowerCase().includes(needle),
    ),
  );
}

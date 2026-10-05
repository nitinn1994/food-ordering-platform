// Demo restaurant list for /restaurants-nearby (docs/features/
// mcdelivery-parity/requirements.md OQ5 (a), AC10). A static fixture,
// labelled as demo data on the page: there is no store domain in
// commerce-api and no geolocation is ever requested.
export type DemoStore = {
  id: string;
  name: string;
  address: string;
  hours: string;
  open: boolean;
  distance: string;
};

export const DEMO_STORES: readonly DemoStore[] = [
  {
    id: "central",
    name: "QuickServe Central",
    address: "12 Market Road, City Centre",
    hours: "7:00 am – 11:00 pm",
    open: true,
    distance: "650 m",
  },
  {
    id: "lakeside",
    name: "QuickServe Lakeside",
    address: "4 Lake View Promenade",
    hours: "8:00 am – 12:00 am",
    open: true,
    distance: "1.3 km",
  },
  {
    id: "station",
    name: "QuickServe Station Square",
    address: "Platform Plaza, Station Square",
    hours: "24 hours",
    open: true,
    distance: "2.1 km",
  },
  {
    id: "techpark",
    name: "QuickServe Tech Park",
    address: "Block B, Riverside Tech Park",
    hours: "9:00 am – 9:00 pm",
    open: false,
    distance: "3.4 km",
  },
];

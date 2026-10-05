import { HeroBanner } from "../../components/home/HeroBanner";
import { AppBand } from "../../components/layout/AppBand";
import { QuickPicks } from "../../components/home/QuickPicks";
import { CategoryBento } from "../../components/home/CategoryBento";
import { MenuLayout } from "../../components/menu/MenuLayout";
import { getMenu } from "../../lib/menu/menuSource";
import { BRAND_NAME } from "../../lib/brand";
import styles from "./page.module.css";

// Rendered per request, never prerendered: getMenu() reads commerce-api,
// which need not be running during `next build`, and whose menu must not be
// frozen into the build. `cache: "no-store"` alone did not opt this route
// out of prerendering (docs/features/phase-11-web-commerce-integration/
// plan.md, Assumption B — the plan's recorded fallback).
export const dynamic = "force-dynamic";

// In the (home) route group with its own loading.tsx, so the loading
// fallback wraps only this page. At the app root it wrapped every route,
// and a streamed fallback made notFound() and redirect() on /menu/... and
// /tag/... answer 200 instead of 404 / 307 (mcdelivery-parity Phase 3).

// Async Server Component: getMenu() is awaited here, once, and the result is
// passed down as a prop everywhere it's needed. loading.tsx and error.tsx
// (siblings in this directory) are Next.js's own Suspense/error-boundary
// wiring around this await — no explicit <Suspense> needed for a page-level
// async Server Component.
//
// UiProvider/CartProvider now live in app/layout.tsx, not here — see
// docs/features/phase-3-frontend-cart-simulation/plan.md — so cart state
// survives navigating to /cart and back.
//
// Layout: the full-width hero, then the menu (components/menu/MenuLayout,
// shared with /menu/[categoryId] — mcdelivery-parity Phase 3), then the SEO
// text and the app band, as on the reference home page
// (reference-inventory.md §1). Quick Picks and the category tiles are
// mobile-only shortcuts into the same menu (Phase 2).
export default async function Home() {
  const categories = await getMenu();

  return (
    <main>
      <HeroBanner />
      <MenuLayout
        categories={categories}
        beforeBand={<QuickPicks categories={categories} />}
        afterBand={<CategoryBento categories={categories} />}
      />
      <section className={styles.about} aria-labelledby="about-title">
        <h2 id="about-title">{BRAND_NAME} — order food online</h2>
        <p>
          Browse the menu, build your order and check out in a few taps — or
          just say what you want. {BRAND_NAME} takes orders by voice, text or
          touch.
        </p>
        <p>
          Pick from breakfast, burgers and wraps, fried chicken, sides, value
          meals, drinks and desserts. Veg and non-veg markers, allergens and
          calories are shown on every item.
        </p>
      </section>
      <AppBand />
    </main>
  );
}

"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { BRAND_TAGLINE } from "../../lib/brand";
import { HeroIllustration } from "../brand/illustrations";
import styles from "./HeroBanner.module.css";

// The reference design's hero (docs/features/mcdelivery-parity/
// reference-inventory.md §1): a yellow strip, a black band holding one
// promotional slide, and a thumbnail selector overlapping the band's lower
// edge. No autoplay and no carousel library (plan.md Phase 1, AC5); the
// customer picks a slide. Original copy and artwork (OQ1) — no slide makes
// an offer the menu does not back.
type Slide = {
  id: string;
  eyebrow: string;
  headline: string;
  tagline: string;
  tone: "red" | "yellow" | "brown";
  art: string | null;
};

const SLIDES: readonly Slide[] = [
  {
    id: "favourites",
    eyebrow: "Hot, fresh and fast",
    headline: "Your favourites, delivered.",
    tagline: `${BRAND_TAGLINE}.`,
    tone: "red",
    art: null,
  },
  {
    id: "breakfast",
    eyebrow: "Mornings",
    headline: "Breakfast, all morning.",
    tagline: "Muffins, hash browns and a hot coffee.",
    tone: "yellow",
    art: "/menu/breakfast.svg",
  },
  {
    id: "voice",
    eyebrow: "Hands busy?",
    headline: "Just say what you want.",
    tagline: "Tap the mic and order by voice.",
    tone: "brown",
    art: "/menu/meal.svg",
  },
];

export function HeroBanner() {
  const [active, setActive] = useState(0);
  const thumbs = useRef<(HTMLButtonElement | null)[]>([]);
  const slide = SLIDES[active]!;

  // Arrow keys move between the thumbnails and select as they go, like a
  // tab list; Home / End jump to the ends.
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = SLIDES.length - 1;
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % SLIDES.length
        : event.key === "ArrowLeft"
          ? (index - 1 + SLIDES.length) % SLIDES.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    thumbs.current[next]?.focus();
  }

  return (
    <section
      className={styles.hero}
      aria-label="Featured"
      aria-roledescription="carousel"
    >
      <div className={styles.strip} aria-hidden="true" />
      <div className={styles.band}>
        <div
          className={`${styles.slide} ${styles[slide.tone]}`}
          role="group"
          aria-roledescription="slide"
          aria-label={`${active + 1} of ${SLIDES.length}`}
          aria-live="polite"
        >
          <div className={styles.copy}>
            <p className={styles.eyebrow}>{slide.eyebrow}</p>
            <p className={styles.headline}>{slide.headline}</p>
            <p className={styles.tagline}>{slide.tagline}</p>
          </div>
          <div className={styles.art}>
            {slide.art === null ? (
              <HeroIllustration />
            ) : (
              // Decorative; the slide's text says what it shows.
              <img src={slide.art} alt="" />
            )}
          </div>
        </div>
        {SLIDES.length > 1 && (
          <div className={styles.thumbs} role="group" aria-label="Choose a slide">
            {SLIDES.map((item, index) => (
              <button
                key={item.id}
                ref={(element) => {
                  thumbs.current[index] = element;
                }}
                type="button"
                className={`${styles.thumb} ${styles[item.tone]}`}
                aria-pressed={index === active}
                aria-label={`Slide ${index + 1}: ${item.headline}`}
                tabIndex={index === active ? 0 : -1}
                onClick={() => setActive(index)}
                onKeyDown={(event) => onKeyDown(event, index)}
              >
                <span aria-hidden="true">{item.headline}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

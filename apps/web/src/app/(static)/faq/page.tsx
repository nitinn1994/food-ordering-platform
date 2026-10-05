import type { Metadata } from "next";
import { StaticPage } from "../../../components/layout/StaticPage";
import { FAQ_TOPICS } from "../../../lib/content/staticPages";
import { BRAND_NAME } from "../../../lib/brand";
import styles from "./page.module.css";

export const metadata: Metadata = { title: `FAQ — ${BRAND_NAME}` };

// The reference's FAQ (docs/features/mcdelivery-parity/
// reference-inventory.md §16; AC11): topic chips, then questions that open
// in place. Native <details>, so it works without JavaScript; the chips
// are in-page links to each topic.
export default function FaqPage() {
  return (
    <StaticPage title="FAQ" intro="Answers to the questions we hear most.">
      <nav aria-label="Topics">
        <ul className={styles.topics}>
          {FAQ_TOPICS.map((topic) => (
            <li key={topic.id}>
              <a href={`#${topic.id}`} className={styles.topic}>
                {topic.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {FAQ_TOPICS.map((topic) => (
        <section key={topic.id} id={topic.id} aria-labelledby={`${topic.id}-title`}>
          <h2 id={`${topic.id}-title`}>{topic.title}</h2>
          {topic.questions.map((entry) => (
            <details key={entry.question} className={styles.question}>
              <summary>{entry.question}</summary>
              <p>{entry.answer}</p>
            </details>
          ))}
        </section>
      ))}
    </StaticPage>
  );
}

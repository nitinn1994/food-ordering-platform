import type { StaticPage as StaticPageContent } from "../../lib/content/staticPages";
import { StaticPage } from "./StaticPage";

// About, privacy and terms: one template, copy from lib/content/staticPages
// (mcdelivery-parity AC11).
export function StaticContent({ page }: { page: StaticPageContent }) {
  return (
    <StaticPage title={page.title} intro={page.intro}>
      {page.sections.map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          <p>{section.body}</p>
        </section>
      ))}
    </StaticPage>
  );
}

import type { Metadata } from "next";
import { StaticContent } from "../../../components/layout/StaticContent";
import { ABOUT_PAGE } from "../../../lib/content/staticPages";
import { BRAND_NAME } from "../../../lib/brand";

export const metadata: Metadata = { title: `${ABOUT_PAGE.title} — ${BRAND_NAME}` };

export default function AboutPage() {
  return <StaticContent page={ABOUT_PAGE} />;
}

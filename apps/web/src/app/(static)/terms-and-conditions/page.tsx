import type { Metadata } from "next";
import { StaticContent } from "../../../components/layout/StaticContent";
import { TERMS_PAGE } from "../../../lib/content/staticPages";
import { BRAND_NAME } from "../../../lib/brand";

export const metadata: Metadata = { title: `${TERMS_PAGE.title} — ${BRAND_NAME}` };

export default function TermsAndConditionsPage() {
  return <StaticContent page={TERMS_PAGE} />;
}

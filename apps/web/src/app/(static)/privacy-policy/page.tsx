import type { Metadata } from "next";
import { StaticContent } from "../../../components/layout/StaticContent";
import { PRIVACY_PAGE } from "../../../lib/content/staticPages";
import { BRAND_NAME } from "../../../lib/brand";

export const metadata: Metadata = { title: `${PRIVACY_PAGE.title} — ${BRAND_NAME}` };

export default function PrivacyPolicyPage() {
  return <StaticContent page={PRIVACY_PAGE} />;
}

import type { Metadata } from "next";
import Link from "next/link";
import { StaticPage } from "../../../components/layout/StaticPage";
import { getMenu } from "../../../lib/menu/menuSource";
import { FEATURE_LABELS } from "../../../lib/menu/featured";
import { FOOTER_LINKS } from "../../../lib/content/footerLinks";
import { BRAND_NAME } from "../../../lib/brand";
import styles from "./page.module.css";

// Per request: the category list is commerce-api's menu.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Site Map — ${BRAND_NAME}` };

// The reference's three-column site map (reference-inventory.md §15;
// AC11): every in-app page, the menu's categories and the featured lists.
export default async function SitemapPage() {
  const categories = await getMenu();
  const columns = [
    {
      title: "Order",
      links: [
        { label: "Home", href: "/" },
        { label: "Search", href: "/search" },
        { label: "Cart", href: "/cart" },
        { label: "My Account", href: "/profile" },
        ...Object.entries(FEATURE_LABELS).map(([feature, label]) => ({
          label,
          href: `/tag/${feature}`,
        })),
      ],
    },
    {
      title: "Menu",
      links: categories.map((category) => ({
        label: category.name,
        href: `/menu/${encodeURIComponent(category.id)}`,
      })),
    },
    { title: "About", links: FOOTER_LINKS },
  ];

  return (
    <StaticPage title="Site Map" wide>
      <div className={styles.columns}>
        {columns.map((column) => (
          <section key={column.title} aria-labelledby={`sitemap-${column.title}`}>
            <h2 id={`sitemap-${column.title}`}>{column.title}</h2>
            <ul className={styles.links}>
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </StaticPage>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MenuLayout } from "../../../components/menu/MenuLayout";
import { getMenu } from "../../../lib/menu/menuSource";
import { RouteCategoryProvider } from "../../../lib/menu/routeCategory";
import { BRAND_NAME } from "../../../lib/brand";

// One category's page (docs/features/mcdelivery-parity/plan.md, Phase 3;
// AC6): the same menu as the home page, opened on that category. Per
// request, like the home page: the menu is commerce-api's, never frozen
// into the build.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ categoryId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { categoryId } = await params;
  const category = (await getMenu()).find((candidate) => candidate.id === categoryId);
  return { title: category ? `${category.name} — ${BRAND_NAME}` : BRAND_NAME };
}

export default async function CategoryPage({ params }: Props) {
  const { categoryId } = await params;
  const categories = await getMenu();
  // An unknown id is a 404, not an empty menu.
  if (!categories.some((category) => category.id === categoryId)) {
    notFound();
  }

  return (
    <main>
      <RouteCategoryProvider categoryId={categoryId}>
        <MenuLayout categories={categories} />
      </RouteCategoryProvider>
    </main>
  );
}

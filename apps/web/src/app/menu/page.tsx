import { notFound, redirect } from "next/navigation";
import { getMenu } from "../../lib/menu/menuSource";

// The mobile "Menu" tab (mcdelivery-parity Phase 2) opens the first
// category's page, as the reference's does.
export const dynamic = "force-dynamic";

export default async function MenuIndex() {
  const [first] = await getMenu();
  if (first === undefined) {
    notFound();
  }
  redirect(`/menu/${encodeURIComponent(first.id)}`);
}

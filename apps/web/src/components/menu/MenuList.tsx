"use client";

import { MENU } from "../../lib/fixtures/menu";
import { useUi } from "../../lib/state/uiStore";
import { MenuItemCard } from "./MenuItemCard";
import styles from "./MenuList.module.css";

export function MenuList() {
  const { selectedCategory } = useUi();

  const categories = selectedCategory
    ? MENU.filter((category) => category.id === selectedCategory)
    : MENU;

  return (
    <div className={styles.list}>
      {categories.map((category) => (
        <section key={category.id}>
          <h2>{category.name}</h2>
          <ul className={styles.items}>
            {category.items.map((item) => (
              <MenuItemCard key={item.id} item={item} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

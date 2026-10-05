import type { DemoStore } from "../../lib/content/stores";
import styles from "./StoreList.module.css";

// The reference's store cards (docs/features/mcdelivery-parity/
// reference-inventory.md §10, §13; AC10): name, open status, hours and
// distance. Demo data, and no geolocation is ever requested — distances
// are part of the fixture.
export function StoreList({ stores }: { stores: readonly DemoStore[] }) {
  if (stores.length === 0) {
    return (
      <p role="status" className={styles.empty}>
        Sorry, we do not serve this location yet.
      </p>
    );
  }

  return (
    <ul className={styles.list}>
      {stores.map((store) => (
        <li key={store.id} className={styles.card}>
          <div className={styles.head}>
            <h2 className={styles.name}>{store.name}</h2>
            <span className={styles.distance}>{store.distance}</span>
          </div>
          <p className={styles.address}>{store.address}</p>
          <p>
            <span className={store.open ? styles.open : styles.closed}>
              {store.open ? "Open" : "Closed"}
            </span>{" "}
            · {store.hours}
          </p>
        </li>
      ))}
    </ul>
  );
}

import type { MenuItemId } from "@contracts/common";
import type { MenuCategory, MenuItem } from "./menu.types";

// The port this domain depends on. An abstract class rather than a plain
// TypeScript interface so it doubles as its own Nest DI token — MenuService
// is injected with `MenuRepository` by class type, no `@Inject()`, the same
// convention Phase 6 established (HealthController → HealthService).
// MenuModule binds `{ provide: MenuRepository, useClass: InMemoryMenuRepository }`
// (requirements.md AC5): only that binding, and the infrastructure/ adapter
// it names, ever touches the storage mechanism.
//
// Both methods are async even though today's only implementation is
// in-memory — a real database adapter later does not change this
// signature or MenuService's calls against it.
export abstract class MenuRepository {
  // Categories with their items nested, in display order.
  abstract listCategories(): Promise<readonly MenuCategory[]>;

  // undefined, not a thrown error, for "no such item" — deciding that this
  // is a 404 is MenuService's job, not the repository's.
  abstract findItemById(id: MenuItemId): Promise<MenuItem | undefined>;
}

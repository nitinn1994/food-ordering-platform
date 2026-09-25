// Recursively freezes a value so a caller mutating what an in-memory
// repository returns throws in strict mode, rather than silently corrupting
// shared in-memory state. Shared by the Menu and Cart infrastructure
// adapters (Phase 7 requirements.md AC7; Phase 8 requirements.md AC13).
//
// Pass it a clone, never the stored object itself: freezing is in place,
// so freezing the original would make the repository's own state
// unwritable.
export function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const element of value) {
      deepFreeze(element);
    }
  } else if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return Object.freeze(value);
}

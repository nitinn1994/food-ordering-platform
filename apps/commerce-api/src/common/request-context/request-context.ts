import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  requestId: string;
  correlationId: string;
}

// One AsyncLocalStorage instance for the whole process, populated by
// RequestContextMiddleware for the lifetime of a single request. Anything
// downstream — the logger, an exception filter, a future domain service —
// reads it without req/res ever being threaded through its call stack
// (plan.md, Phase 6, §11).
export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

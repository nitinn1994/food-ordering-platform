import { contractErrorSchema } from "@contracts/common";
import { resolveApiBase } from "./config";
import { ApiError, isRetryable } from "./errors";

// The single place apps/web performs HTTP — plan.md §6 (AC15). React
// components never import this; they go through the menu/cart/order
// service functions, or useCart().
//
// Every successful body is validated against its @contracts/api-contracts
// schema before anyone sees it (OD8): commerce-api is first-party, but this
// is still a network boundary, and a body that does not match the contract
// must fail loudly here rather than render as garbage.
//
// Request bodies are never logged — an order request carries customer
// personal data (commerce-api.md §13).

export const DEFAULT_TIMEOUT_MS = 8_000;
export const ORDER_TIMEOUT_MS = 15_000;

// Two retries after the first attempt, for requests that opt in — plan.md
// §13 (OD9).
export const RETRY_DELAYS_MS: readonly number[] = [250, 750];

// Structural rather than a zod import: any @contracts schema satisfies it,
// and this module needs no direct zod dependency (plan.md §16).
export type ResponseSchema<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
};

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type RequestOptions<T> = {
  method: HttpMethod;
  // Always under /v1 — e.g. "/v1/cart/items". Only /v1 is proxied.
  path: string;
  body?: unknown;
  schema: ResponseSchema<T>;
  timeoutMs?: number;
  // Opt-in, and only for requests that are safe to repeat: GETs, and
  // POST /v1/orders with the same idempotency key. Never a cart mutation —
  // POST /v1/cart/items double-counts on retry (system-architecture.md §8
  // gap 3).
  retry?: boolean;
};

// Injectable for tests; production callers pass nothing.
export type RequestDeps = {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  sleep?: (ms: number) => Promise<void>;
};

const METHODS_WITH_BODY = new Set<HttpMethod>(["POST", "PATCH"]);

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJson(text: string): unknown {
  if (text.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function attempt<T>(
  options: RequestOptions<T>,
  url: string,
  fetchImpl: typeof fetch,
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const init: RequestInit = {
    method: options.method,
    headers,
    // Commerce state is never served from an HTTP cache. In a Server
    // Component this is also what makes the route dynamic, so `next build`
    // never needs a running API (plan.md §9, AC2).
    cache: "no-store",
  };
  // GET and DELETE carry no body and no Content-Type: commerce-api's
  // content-type guard rejects a non-JSON body, and there is no reason to
  // send an empty one.
  if (METHODS_WITH_BODY.has(options.method) && options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  init.signal = controller.signal;

  let response: Response;
  let text: string;
  try {
    response = await fetchImpl(url, init);
    // Read inside the timeout too — a stalled body is as much a timeout as
    // a stalled connection.
    text = await response.text();
  } catch {
    throw new ApiError({ kind: timedOut ? "timeout" : "network" });
  } finally {
    clearTimeout(timer);
  }

  const requestId = response.headers.get("x-request-id") ?? undefined;
  const payload = parseJson(text);

  if (!response.ok) {
    const parsed = contractErrorSchema.safeParse(payload);
    throw new ApiError({
      kind: "http",
      status: response.status,
      requestId,
      ...(parsed.success
        ? { code: parsed.data.code, field: parsed.data.field }
        : {}),
    });
  }

  const parsed = options.schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError({
      kind: "invalid-response",
      status: response.status,
      requestId,
    });
  }
  return parsed.data;
}

export async function request<T>(
  options: RequestOptions<T>,
  deps: RequestDeps = {},
): Promise<T> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const url = `${deps.baseUrl ?? resolveApiBase()}${options.path}`;
  const delays = options.retry ? RETRY_DELAYS_MS : [];

  for (let index = 0; ; index += 1) {
    try {
      return await attempt(options, url, fetchImpl);
    } catch (error) {
      const delay = delays[index];
      if (
        delay === undefined ||
        !(error instanceof ApiError) ||
        !isRetryable(error)
      ) {
        throw error;
      }
      await sleep(delay);
    }
  }
}

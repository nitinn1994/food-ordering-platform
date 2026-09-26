import { vi } from "vitest";

// Test-only stand-in for the network — plan.md §17. Queues canned
// responses and records every call, so a test can assert exactly what was
// sent (method, path, body) without MSW or a running commerce-api.

export type StubJsonReply = {
  status?: number;
  body?: unknown;
  rawBody?: string;
  headers?: Record<string, string>;
};

export type StubReply =
  | StubJsonReply
  | { networkError: true }
  // Full control — e.g. a deferred promise to hold a request in flight.
  | ((init: RequestInit) => Promise<Response>);

export type RecordedCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
};

function toResponse(reply: StubJsonReply): Response {
  const text =
    reply.rawBody ?? (reply.body === undefined ? "" : JSON.stringify(reply.body));
  return new Response(text, {
    status: reply.status ?? 200,
    headers: { "content-type": "application/json", ...reply.headers },
  });
}

export function createFetchStub() {
  const queue: StubReply[] = [];
  const calls: RecordedCall[] = [];

  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({
      url: String(input),
      method: init.method ?? "GET",
      headers: { ...(init.headers as Record<string, string> | undefined) },
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    });
    const reply = queue.shift();
    if (reply === undefined) {
      throw new Error(`fetchStub: unexpected request ${init.method ?? "GET"} ${String(input)}`);
    }
    if (typeof reply === "function") {
      return reply(init);
    }
    if ("networkError" in reply) {
      throw new TypeError("fetch failed");
    }
    return toResponse(reply);
  });

  return {
    fetch: fetchImpl as unknown as typeof fetch,
    calls,
    reply(...replies: StubReply[]) {
      queue.push(...replies);
    },
    pending(): number {
      return queue.length;
    },
  };
}

// Replaces the global fetch for component tests, which cannot inject one.
// Pair with vi.unstubAllGlobals() in afterEach.
export function installFetchStub() {
  const stub = createFetchStub();
  vi.stubGlobal("fetch", stub.fetch);
  return stub;
}

// A promise whose settlement the test controls — for holding a request in
// flight to assert pending UI.
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

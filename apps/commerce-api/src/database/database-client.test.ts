import { describe, expect, it } from "vitest";
import { testConfig } from "../config/test-config";
import { DatabaseClient, createDatabase } from "./database-client";
import { DatabaseUnavailableError } from "./persistence.errors";

// No database needed: nothing listens on port 1, so the connection is
// refused immediately (docs/features/phase-10-database-persistence/plan.md
// OD8; requirements.md AC13).
const UNREACHABLE_URL = "postgres://marker-user:marker-pass@127.0.0.1:1/marker_db";

describe("DatabaseClient boot check", () => {
  it("fails fast when the database is unreachable, naming only the code", async () => {
    const client = new DatabaseClient(
      createDatabase(testConfig({ DATABASE_URL: UNREACHABLE_URL })),
    );
    try {
      const error: unknown = await client.onModuleInit().then(
        () => undefined,
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(Error);
      const message = (error as Error).message;
      expect(message).toBe("Database unreachable at startup (code ECONNREFUSED).");
      for (const secret of ["marker-user", "marker-pass", "marker_db", "127.0.0.1"]) {
        expect(message).not.toContain(secret);
      }
      expect((error as { cause?: unknown }).cause).toBeUndefined();
    } finally {
      await client.onApplicationShutdown();
    }
  });

  it("does not connect until something queries", async () => {
    // Constructing the pool and client must not throw or connect — DB-free
    // tests compile AppModule with a placeholder URL (test-config.ts).
    const client = new DatabaseClient(
      createDatabase(testConfig({ DATABASE_URL: UNREACHABLE_URL })),
    );
    expect(client.executor().isTransaction).toBe(false);
    await client.onApplicationShutdown();
  });
});

describe("DatabaseClient.transaction — failures of the transaction itself", () => {
  // Acquiring the connection fails before BEGIN: the driver's raw error is
  // mapped like any repository's (review-report.md #1), and `work` never
  // runs.
  it("maps an unreachable database to DatabaseUnavailableError, without running work", async () => {
    const client = new DatabaseClient(
      createDatabase(testConfig({ DATABASE_URL: UNREACHABLE_URL })),
    );
    let ran = false;
    try {
      await expect(
        client.transaction(async () => {
          ran = true;
        }),
      ).rejects.toBeInstanceOf(DatabaseUnavailableError);
      expect(ran).toBe(false);
    } finally {
      await client.onApplicationShutdown();
    }
  });
});

describe("DatabaseClient.ping — readiness (Phase 18 AC6)", () => {
  it("answers false, without throwing, when the database is unreachable", async () => {
    const client = new DatabaseClient(
      createDatabase(testConfig({ DATABASE_URL: UNREACHABLE_URL })),
    );
    try {
      await expect(client.ping(1_000)).resolves.toBe(false);
    } finally {
      await client.onApplicationShutdown();
    }
  });

  it("answers false at the deadline when the database does not respond", async () => {
    // A listener that accepts the TCP connection and never speaks.
    const { createServer } = await import("node:net");
    const sockets: import("node:net").Socket[] = [];
    const server = createServer((socket) => sockets.push(socket));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as import("node:net").AddressInfo;
    const client = new DatabaseClient(
      createDatabase(testConfig({ DATABASE_URL: `postgres://u:p@127.0.0.1:${port}/db` })),
    );
    try {
      const started = Date.now();
      await expect(client.ping(200)).resolves.toBe(false);
      expect(Date.now() - started).toBeLessThan(1_000);
    } finally {
      for (const socket of sockets) socket.destroy();
      server.close();
      await client.onApplicationShutdown().catch(() => undefined);
    }
  });
});

import type { ArgumentsHost } from "@nestjs/common";
import { HttpException, HttpStatus, NotFoundException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AllExceptionsFilter } from "./all-exceptions.filter";
import { ApiException } from "./api.exception";
import { DomainError } from "./domain.error";

function fakeResponse(): {
  res: { status: (code: number) => typeof res; json: (body: unknown) => void };
  state: { status?: number; body?: unknown };
} {
  const state: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      state.status = code;
      return res;
    },
    json(body: unknown) {
      state.body = body;
    },
  };
  return { res, state };
}

function fakeHost(response: unknown): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({}),
      getNext: () => undefined,
    }),
  } as unknown as ArgumentsHost;
}

describe("AllExceptionsFilter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses an ApiException's own status and ContractError verbatim", () => {
    const filter = new AllExceptionsFilter();
    const { res, state } = fakeResponse();
    const exception = new ApiException(HttpStatus.BAD_REQUEST, {
      code: "INVALID_PAYLOAD",
      message: "bad",
      field: "itemId",
    });

    filter.catch(exception, fakeHost(res));

    expect(state.status).toBe(HttpStatus.BAD_REQUEST);
    expect(state.body).toEqual({
      code: "INVALID_PAYLOAD",
      message: "bad",
      field: "itemId",
    });
  });

  it("uses a DomainError's own status and code, not the generic 500 path", () => {
    class FakeDomainError extends DomainError {
      constructor() {
        super(404, "MENU_ITEM_NOT_FOUND", "Menu item not found.");
      }
    }
    const filter = new AllExceptionsFilter();
    const { res, state } = fakeResponse();

    filter.catch(new FakeDomainError(), fakeHost(res));

    expect(state.status).toBe(404);
    expect(state.body).toEqual({
      code: "MENU_ITEM_NOT_FOUND",
      message: "Menu item not found.",
    });
  });

  it("does not log a DomainError below 500 to stderr", () => {
    class FakeDomainError extends DomainError {
      constructor() {
        super(404, "MENU_ITEM_NOT_FOUND", "Menu item not found.");
      }
    }
    const filter = new AllExceptionsFilter();
    const { res } = fakeResponse();
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    filter.catch(new FakeDomainError(), fakeHost(res));

    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("maps a 404 HttpException to ROUTE_NOT_FOUND", () => {
    const filter = new AllExceptionsFilter();
    const { res, state } = fakeResponse();

    filter.catch(new NotFoundException(), fakeHost(res));

    expect(state.status).toBe(HttpStatus.NOT_FOUND);
    expect(state.body).toMatchObject({ code: "ROUTE_NOT_FOUND" });
  });

  it("maps a body-parser-shaped entity.too.large error to 413 PAYLOAD_TOO_LARGE", () => {
    const filter = new AllExceptionsFilter();
    const { res, state } = fakeResponse();
    // Never thrown as a Nest HttpException — this is body-parser's own
    // error shape, detected structurally (see isPayloadTooLargeError).
    const bodyParserError = { type: "entity.too.large", status: 413 };

    filter.catch(bodyParserError, fakeHost(res));

    expect(state.status).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(state.body).toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });

  it("returns a bare 500 INTERNAL_ERROR for an unknown thrown Error, leaking nothing (AC7)", () => {
    const filter = new AllExceptionsFilter();
    const { res, state } = fakeResponse();
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    filter.catch(new Error("boom-secret-detail-9f3a"), fakeHost(res));

    expect(state.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(state.body).toEqual({
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
    });
    expect(JSON.stringify(state.body)).not.toContain("boom-secret-detail-9f3a");

    // Logged server-side, not silently dropped.
    const logged = stderrSpy.mock.calls
      .map(([chunk]) => String(chunk))
      .join("");
    expect(logged).toContain("boom-secret-detail-9f3a");
  });

  it("gives a 5xx HttpException the same generic treatment as an unknown error", () => {
    const filter = new AllExceptionsFilter();
    const { res, state } = fakeResponse();
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    filter.catch(
      new HttpException("internal detail not for clients", 500),
      fakeHost(res),
    );

    expect(state.status).toBe(500);
    expect(state.body).toEqual({
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
    });
  });

  it("does not log a 4xx error to stderr", () => {
    const filter = new AllExceptionsFilter();
    const { res } = fakeResponse();
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    filter.catch(new NotFoundException(), fakeHost(res));

    expect(stderrSpy).not.toHaveBeenCalled();
  });
});

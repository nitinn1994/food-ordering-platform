import { describe, expect, it } from "vitest";
import {
  validateCustomerDetails,
  validateEmail,
  validateFullName,
  validatePhone,
} from "./validation";

describe("validateFullName", () => {
  it("requires a non-empty name", () => {
    expect(validateFullName("")).toBe("Enter your name.");
  });

  it("rejects whitespace-only input", () => {
    expect(validateFullName("   ")).toBe("Enter your name.");
  });

  it("accepts a trimmed name within the length limit", () => {
    expect(validateFullName("  Ada Lovelace  ")).toBeUndefined();
  });

  it("accepts a name at exactly 100 characters", () => {
    expect(validateFullName("a".repeat(100))).toBeUndefined();
  });

  it("rejects a name over 100 characters", () => {
    expect(validateFullName("a".repeat(101))).toBe("Name is too long.");
  });
});

describe("validatePhone", () => {
  it("requires a non-empty phone number", () => {
    expect(validatePhone("")).toBe("Enter a phone number.");
  });

  it("rejects whitespace-only input", () => {
    expect(validatePhone("   ")).toBe("Enter a phone number.");
  });

  it("accepts a formatted international number", () => {
    expect(validatePhone("+1 (555) 123-4567")).toBeUndefined();
  });

  it("accepts a plain digit string within range", () => {
    expect(validatePhone("5551234567")).toBeUndefined();
  });

  it("rejects a number that is too short", () => {
    expect(validatePhone("12345")).toBe("Enter a valid phone number.");
  });

  it("rejects a number that is too long", () => {
    expect(validatePhone("1".repeat(21))).toBe("Enter a valid phone number.");
  });

  it("rejects non-numeric input", () => {
    expect(validatePhone("abc")).toBe("Enter a valid phone number.");
  });
});

describe("validateEmail", () => {
  it("is optional — empty is valid", () => {
    expect(validateEmail("")).toBeUndefined();
  });

  it("is optional — whitespace-only is valid", () => {
    expect(validateEmail("   ")).toBeUndefined();
  });

  it("accepts a well-shaped address", () => {
    expect(validateEmail("person@example.com")).toBeUndefined();
  });

  it("rejects a value missing an @", () => {
    expect(validateEmail("not-an-email")).toBe(
      "Enter a valid email address, or leave it blank.",
    );
  });

  it("rejects a value missing a domain dot", () => {
    expect(validateEmail("person@example")).toBe(
      "Enter a valid email address, or leave it blank.",
    );
  });
});

describe("validateCustomerDetails", () => {
  it("returns no errors for fully valid details", () => {
    const errors = validateCustomerDetails({
      fullName: "Ada Lovelace",
      phone: "5551234567",
      email: "",
    });
    expect(errors).toEqual({});
  });

  it("returns an error per invalid field, keyed by field name", () => {
    const errors = validateCustomerDetails({
      fullName: "",
      phone: "",
      email: "not-an-email",
    });
    expect(Object.keys(errors).sort()).toEqual([
      "email",
      "fullName",
      "phone",
    ]);
  });
});

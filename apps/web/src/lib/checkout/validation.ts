import type { CustomerDetails, CustomerDetailsErrors } from "./types";

// Pure, hand-rolled validators — no form library and no zod. apps/web has
// no form dependency (ChatInput, the only other form in this app, is
// hand-rolled useState too), and zod is used elsewhere in this system only
// at an untrusted-input trust boundary (packages/contracts/ui-commands),
// which this is not: checkout form input is trusted, direct, first-party
// user input. See docs/features/phase-4-frontend-checkout-simulation/plan.md
// § Dependencies required.
//
// Not the authoritative validator: commerce-api's customerDetailsSchema is,
// on POST /v1/orders (same D4 rules). These give instant feedback; a server
// rejection of a customer field returns the user to this form
// (docs/features/phase-11-web-commerce-integration/plan.md §11).

const MAX_NAME_LENGTH = 100;
const MIN_PHONE_DIGITS = 7;
const MAX_PHONE_DIGITS = 20;

// Simple shape check, not full RFC 5322 validation — see module comment.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateFullName(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "Enter your name.";
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    return "Name is too long.";
  }
  return undefined;
}

function stripPhoneFormatting(value: string): string {
  const withoutLeadingPlus = value.startsWith("+") ? value.slice(1) : value;
  return withoutLeadingPlus.replace(/[\s\-()]/g, "");
}

export function validatePhone(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "Enter a phone number.";
  }
  const digitsOnly = stripPhoneFormatting(trimmed);
  const isValidLength =
    digitsOnly.length >= MIN_PHONE_DIGITS &&
    digitsOnly.length <= MAX_PHONE_DIGITS;
  if (!isValidLength || !/^\d+$/.test(digitsOnly)) {
    return "Enter a valid phone number.";
  }
  return undefined;
}

// Optional — a blank email is valid (D4).
export function validateEmail(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (!EMAIL_SHAPE.test(trimmed)) {
    return "Enter a valid email address, or leave it blank.";
  }
  return undefined;
}

export function validateCustomerDetails(
  details: CustomerDetails,
): CustomerDetailsErrors {
  const errors: CustomerDetailsErrors = {};

  const fullNameError = validateFullName(details.fullName);
  if (fullNameError) {
    errors.fullName = fullNameError;
  }

  const phoneError = validatePhone(details.phone);
  if (phoneError) {
    errors.phone = phoneError;
  }

  const emailError = validateEmail(details.email);
  if (emailError) {
    errors.email = emailError;
  }

  return errors;
}

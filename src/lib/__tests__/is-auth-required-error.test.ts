import { describe, expect, it } from "vitest";
import { AuthRequestError, isAuthRequiredError } from "@/lib/auth/is-auth-required-error";

describe("isAuthRequiredError", () => {
  it("matches the BFF gate message", () => {
    expect(isAuthRequiredError(new Error("Authentication required"))).toBe(true);
  });

  it("matches the backend messages for missing and stale tokens", () => {
    expect(isAuthRequiredError(new Error("Not authenticated"))).toBe(true);
    expect(isAuthRequiredError(new Error("Invalid or expired session"))).toBe(true);
  });

  it("trusts the status on AuthRequestError over the message", () => {
    expect(isAuthRequiredError(new AuthRequestError("Nope", 401))).toBe(true);
    expect(isAuthRequiredError(new AuthRequestError("Admin access required", 403))).toBe(false);
    expect(isAuthRequiredError(new AuthRequestError("Not authenticated", 500))).toBe(false);
  });

  it("ignores unrelated failures", () => {
    expect(isAuthRequiredError(new Error("SKU already exists"))).toBe(false);
    expect(isAuthRequiredError(new Error("Backend unavailable"))).toBe(false);
    expect(isAuthRequiredError("Not authenticated")).toBe(false);
    expect(isAuthRequiredError(null)).toBe(false);
  });
});

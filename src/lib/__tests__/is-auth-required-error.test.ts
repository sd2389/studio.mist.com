import { describe, expect, it } from "vitest";
import { isAuthRequiredError } from "@/lib/auth/is-auth-required-error";

describe("isAuthRequiredError", () => {
  it("matches BFF requireSessionApi message", () => {
    expect(isAuthRequiredError(new Error("Authentication required"))).toBe(true);
  });

  it("matches /api/auth/me fallback message", () => {
    expect(isAuthRequiredError(new Error("Not authenticated"))).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isAuthRequiredError(new Error("AUTHENTICATION REQUIRED"))).toBe(true);
  });

  it("rejects generic server failures", () => {
    expect(isAuthRequiredError(new Error("Backend unavailable"))).toBe(false);
    expect(isAuthRequiredError(new Error("Presign failed"))).toBe(false);
    expect(isAuthRequiredError(new Error("Request failed"))).toBe(false);
  });

  it("rejects validation / business errors", () => {
    expect(isAuthRequiredError(new Error("SKU already exists"))).toBe(false);
    expect(isAuthRequiredError(new Error("filename is required"))).toBe(false);
    expect(isAuthRequiredError(new Error("Invalid JSON"))).toBe(false);
  });

  it("rejects rate-limit style errors", () => {
    expect(isAuthRequiredError(new Error("Rate limit exceeded"))).toBe(false);
    expect(isAuthRequiredError(new Error("Too many requests"))).toBe(false);
  });

  it("rejects network-style errors", () => {
    expect(isAuthRequiredError(new Error("Failed to fetch"))).toBe(false);
    expect(isAuthRequiredError(new Error("NetworkError when attempting to fetch resource."))).toBe(
      false,
    );
  });

  it("rejects unrelated permission errors", () => {
    expect(isAuthRequiredError(new Error("Admin access required"))).toBe(false);
    expect(isAuthRequiredError(new Error("Forbidden"))).toBe(false);
  });

  it("rejects non-Error values", () => {
    expect(isAuthRequiredError("Authentication required")).toBe(false);
    expect(isAuthRequiredError({ message: "Authentication required" })).toBe(false);
    expect(isAuthRequiredError(null)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { safeAuthNext } from "@/lib/auth/safe-auth-next";

describe("safeAuthNext", () => {
  it("returns relative app paths", () => {
    expect(safeAuthNext("/pricing")).toBe("/pricing");
    expect(safeAuthNext("/dashboard")).toBe("/dashboard");
    expect(safeAuthNext("/model/abc?x=1")).toBe("/model/abc?x=1");
  });

  it("rejects open redirects and falls back", () => {
    expect(safeAuthNext("//evil.com")).toBe("/dashboard");
    expect(safeAuthNext("https://evil.com")).toBe("/dashboard");
    expect(safeAuthNext("http://evil.com")).toBe("/dashboard");
    expect(safeAuthNext("/\\evil.com")).toBe("/dashboard");
    expect(safeAuthNext("pricing")).toBe("/dashboard");
    expect(safeAuthNext("")).toBe("/dashboard");
    expect(safeAuthNext(null)).toBe("/dashboard");
  });

  it("uses custom fallback", () => {
    expect(safeAuthNext(null, "/profile")).toBe("/profile");
  });
});

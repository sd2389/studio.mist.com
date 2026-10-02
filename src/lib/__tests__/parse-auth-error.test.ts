import { describe, expect, it } from "vitest";
import { parseAuthErrorBody } from "@/lib/auth/parse-auth-error";

describe("parseAuthErrorBody", () => {
  it("reads string detail/error/message", () => {
    expect(parseAuthErrorBody({ detail: "Nope" }, "fallback")).toBe("Nope");
    expect(parseAuthErrorBody({ error: "Bad" }, "fallback")).toBe("Bad");
  });

  it("joins FastAPI validation arrays", () => {
    expect(
      parseAuthErrorBody(
        {
          detail: [
            { loc: ["body", "email"], msg: "field required", type: "missing" },
            { msg: "ensure this value has at least 8 characters" },
          ],
        },
        "fallback",
      ),
    ).toBe("field required; ensure this value has at least 8 characters");
  });

  it("falls back for empty bodies", () => {
    expect(parseAuthErrorBody({}, "Request failed")).toBe("Request failed");
    expect(parseAuthErrorBody(null, "Request failed")).toBe("Request failed");
  });
});

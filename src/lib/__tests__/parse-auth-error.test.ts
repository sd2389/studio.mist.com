import { describe, expect, it } from "vitest";
import { parseAuthErrorBody, problemsFromErrorBody } from "@/lib/auth/parse-auth-error";

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

  it("reads the message of a detail given as an object", () => {
    const detail = { message: "The batch has 2 problems; nothing was made.", problems: [] };
    expect(parseAuthErrorBody({ detail }, "fallback")).toBe("The batch has 2 problems; nothing was made.");
    expect(parseAuthErrorBody({ detail: { problems: [] } }, "fallback")).toBe("fallback");
  });
});

describe("problemsFromErrorBody", () => {
  const problem = { item: 0, row: 2, field: "sku", code: "sku_taken", message: "R-1 is a scene's SKU already." };

  it("finds the problems the API listed, or a proxy passed on", () => {
    expect(problemsFromErrorBody({ detail: { message: "1 problem", problems: [problem] } })).toEqual([problem]);
    expect(problemsFromErrorBody({ error: "1 problem", problems: [problem] })).toEqual([problem]);
  });

  it("is null for answers without any", () => {
    expect(problemsFromErrorBody({ detail: "Batch not found" })).toBeNull();
    expect(problemsFromErrorBody({ detail: [{ msg: "field required" }] })).toBeNull();
    expect(problemsFromErrorBody(null)).toBeNull();
  });
});

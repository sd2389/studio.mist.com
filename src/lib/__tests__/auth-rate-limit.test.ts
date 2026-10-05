import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimitsForTests } from "@/lib/rate-limit";

const upstreamFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();

vi.mock("@/lib/auth/upstream", () => ({
  upstreamFetch: (path: string, init?: RequestInit) => upstreamFetch(path, init),
  readUpstreamJson: async (res: Response) => res.json(),
  upstreamError: (_json: unknown, fallback: string) => fallback,
}));

// A session cookie must not buy a fresh budget: sign-in and sign-up count by IP.
vi.mock("@/lib/auth/server-session", () => ({
  getSessionToken: async () => crypto.randomUUID(),
  sessionCookieOptions: () => ({}),
}));

const { POST: login } = await import("@/app/api/auth/login/route");
const { POST: signup } = await import("@/app/api/auth/signup/route");

function attempt(route: (request: Request) => Promise<Response>, ip: string): Promise<Response> {
  return route(
    new Request("http://localhost/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": `${ip}, 10.0.0.1` },
      body: JSON.stringify({ email: "someone@example.com", password: "not-the-password" }),
    }),
  );
}

async function statuses(route: (request: Request) => Promise<Response>, ip: string, times: number) {
  const seen: number[] = [];
  for (let i = 0; i < times; i += 1) seen.push((await attempt(route, ip)).status);
  return seen;
}

describe("sign-in and sign-up proxies", () => {
  beforeEach(() => {
    resetRateLimitsForTests();
    upstreamFetch.mockReset();
    upstreamFetch.mockImplementation(async () => new Response(JSON.stringify({ detail: "Invalid" }), { status: 401 }));
  });

  it("let one IP try to sign in 30 times an hour, then answer 429 without asking the API", async () => {
    const seen = await statuses(login, "203.0.113.9", 31);

    expect(seen.slice(0, 30)).toEqual(Array(30).fill(401));
    expect(seen[30]).toBe(429);
    expect(upstreamFetch).toHaveBeenCalledTimes(30);
    const refused = await attempt(login, "203.0.113.9");
    expect(Number(refused.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("count each IP on its own", async () => {
    await statuses(login, "203.0.113.9", 31);

    expect((await attempt(login, "198.51.100.4")).status).toBe(401);
  });

  it("let one IP sign up 20 times an hour", async () => {
    const seen = await statuses(signup, "203.0.113.9", 21);

    expect(seen.slice(0, 20)).toEqual(Array(20).fill(401));
    expect(seen[20]).toBe(429);
  });
});

describe("the caller's IP sent to the API", () => {
  beforeEach(() => {
    resetRateLimitsForTests();
    upstreamFetch.mockReset();
    upstreamFetch.mockImplementation(async () => new Response(JSON.stringify({ detail: "Invalid" }), { status: 401 }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function sentHeaders(): Headers {
    return new Headers(upstreamFetch.mock.calls[0]?.[1]?.headers);
  }

  it("goes with INTERNAL_PROXY_TOKEN, so the API can count each caller on its own", async () => {
    vi.stubEnv("INTERNAL_PROXY_TOKEN", "shared-secret");

    await attempt(login, "203.0.113.9");

    expect(sentHeaders().get("X-Internal-Proxy-Token")).toBe("shared-secret");
    expect(sentHeaders().get("X-Client-IP")).toBe("203.0.113.9");
  });

  it("is not sent without the token, which the API would need to believe it", async () => {
    vi.stubEnv("INTERNAL_PROXY_TOKEN", "");

    await attempt(signup, "203.0.113.9");

    expect(sentHeaders().has("X-Client-IP")).toBe(false);
    expect(sentHeaders().has("X-Internal-Proxy-Token")).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatRelativeTime, parseApiTime } from "@/lib/relative-time";

const INSTANT = Date.parse("2026-10-03T14:02:11Z");

describe("parseApiTime", () => {
  it("reads a Z, an offset and a time without a zone as the same UTC instant", () => {
    for (const iso of [
      "2026-10-03T14:02:11Z",
      "2026-10-03T14:02:11z",
      "2026-10-03T14:02:11+00:00",
      "2026-10-03T10:02:11-04:00",
      "2026-10-03T14:02:11",
    ]) {
      expect(parseApiTime(iso).getTime(), iso).toBe(INSTANT);
    }
  });

  it("never adds a second zone, nor one to a bare date", () => {
    expect(parseApiTime("2026-10-03T14:02:11.250Z").getTime()).toBe(INSTANT + 250);
    expect(parseApiTime("2026-10-03").toISOString()).toBe("2026-10-03T00:00:00.000Z");
  });
});

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(INSTANT + 3 * 60 * 1000);
  });
  afterEach(() => vi.useRealTimers());

  it("is the same for the dashboard's Z times as for zoneless ones, whatever the browser's zone", () => {
    expect(formatRelativeTime("2026-10-03T14:02:11Z")).toBe("3 minutes ago");
    expect(formatRelativeTime("2026-10-03T14:02:11")).toBe("3 minutes ago");
    expect(formatRelativeTime("2026-10-03T14:05:11Z")).toBe("just now");
  });

  it("is empty for a time it can't read", () => {
    expect(formatRelativeTime("not a time")).toBe("");
  });
});

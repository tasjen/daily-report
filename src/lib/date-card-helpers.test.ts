import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildSummary,
  getDateAfter,
  getDateRelation,
} from "@/lib/date-card-helpers";
import type { JiraIssue } from "@/type";

function issue(key: string, summary: string, status: string): JiraIssue {
  return {
    id: key,
    key,
    fields: {
      summary,
      updated: "",
      duedate: "",
      status: { name: status },
    },
  };
}

describe("getDateAfter", () => {
  it("returns the next day", () => {
    expect(getDateAfter("2026-07-24")).toBe("2026-07-25");
  });

  it("rolls over month boundaries", () => {
    expect(getDateAfter("2026-01-31")).toBe("2026-02-01");
  });
});

describe("buildSummary", () => {
  it("returns an empty string for no issues", () => {
    expect(buildSummary([])).toBe("");
  });

  it("groups issues into sorted [Status] blocks with sorted bullet lines", () => {
    const summary = buildSummary([
      issue("DR-2", "Fix login", "In Progress"),
      issue("DR-9", "Ship report", "Done"),
      issue("DR-1", "Add tests", "In Progress"),
    ]);
    expect(summary).toBe(
      "[Done]\n• DR-9: Ship report\n\n" +
        "[In Progress]\n• DR-1: Add tests\n• DR-2: Fix login",
    );
  });
});

const daysAgo = (dayCount: number) => `${dayCount} days ago`;

describe("getDateRelation", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("maps 0/1/7+ day differences to the given sentinels", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T12:00:00Z"));
    expect(
      getDateRelation("2026-07-24", "en", "today", "yesterday", daysAgo),
    ).toBe("today");
    expect(
      getDateRelation("2026-07-23", "en", "today", "yesterday", daysAgo),
    ).toBe("yesterday");
    expect(
      getDateRelation("2026-07-14", "en", "today", "yesterday", daysAgo),
    ).toBe("10 days ago");
  });

  it("returns null for malformed or future dates", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T12:00:00Z"));
    expect(
      getDateRelation("not-a-date", "en", "today", "yesterday", daysAgo),
    ).toBeNull();
    expect(
      getDateRelation("2026-07-25", "en", "today", "yesterday", daysAgo),
    ).toBeNull();
  });
});

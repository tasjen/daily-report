import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildSubmission,
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

// Favorites masquerade as issues in `allIssues`, mirroring DateCard's
// favoriteIssues mapping.
function favoriteIssue(text: string): JiraIssue {
  return {
    id: text,
    key: `favorite:${text}`,
    fields: { summary: text, updated: "", duedate: "", status: { name: "" } },
  };
}

describe("buildSubmission", () => {
  it("degrades to one backend-defaulted entry when nothing is selected", () => {
    expect(
      buildSubmission({
        selectedKeys: [],
        allIssues: [issue("DR-1", "Add tests", "In Progress")],
        createdKeys: new Set(),
        projectMap: {},
        defaultProject: null,
        favorites: [],
      }),
    ).toEqual({
      summaryText: "",
      submitEntries: [{ project: null, summary: "" }],
    });
  });

  it("sends unmapped selected issues as one backend-defaulted entry", () => {
    const { summaryText, submitEntries } = buildSubmission({
      selectedKeys: ["DR-1", "XX-2"],
      allIssues: [
        issue("DR-1", "Add tests", "In Progress"),
        issue("XX-2", "Write docs", "Done"),
        issue("DR-3", "Not selected", "Done"),
      ],
      createdKeys: new Set(),
      projectMap: {},
      defaultProject: null,
      favorites: [],
    });
    expect(summaryText).toBe(
      "[Done]\n• XX-2: Write docs\n\n[In Progress]\n• DR-1: Add tests",
    );
    expect(submitEntries).toEqual([{ project: null, summary: summaryText }]);
  });

  it("leads the summary with selected favorites as plain bullets", () => {
    const { summaryText, submitEntries } = buildSubmission({
      selectedKeys: ["favorite:Standup", "XX-2"],
      allIssues: [
        favoriteIssue("Standup"),
        issue("XX-2", "Write docs", "Done"),
      ],
      createdKeys: new Set(),
      projectMap: {},
      defaultProject: null,
      favorites: [{ text: "Standup", project_key: null }],
    });
    expect(summaryText).toBe("• Standup\n\n[Done]\n• XX-2: Write docs");
    expect(submitEntries).toEqual([{ project: null, summary: summaryText }]);
  });

  it("relabels created-group issues to a [Created] block without mutating them", () => {
    const created = issue("DR-1", "Add tests", "In Progress");
    const { summaryText } = buildSubmission({
      selectedKeys: ["DR-1", "XX-2"],
      allIssues: [created, issue("XX-2", "Write docs", "Done")],
      createdKeys: new Set(["DR-1"]),
      projectMap: {},
      defaultProject: null,
      favorites: [],
    });
    expect(summaryText).toBe(
      "[Created]\n• DR-1: Add tests\n\n[Done]\n• XX-2: Write docs",
    );
    expect(created.fields.status.name).toBe("In Progress");
  });

  it("buckets mapped tasks into rows by portal project, largest first", () => {
    const { submitEntries } = buildSubmission({
      selectedKeys: ["DR-1", "DR-2", "OPS-8", "OPS-9", "favorite:Deploy"],
      allIssues: [
        issue("DR-1", "Add tests", "In Progress"),
        issue("DR-2", "Fix login", "Done"),
        issue("OPS-8", "Rotate keys", "In Progress"),
        issue("OPS-9", "Patch server", "Done"),
        favoriteIssue("Deploy"),
      ],
      createdKeys: new Set(),
      projectMap: { DR: "100", OPS: "200" },
      defaultProject: null,
      favorites: [{ text: "Deploy", project_key: "OPS" }],
    });
    expect(submitEntries).toEqual([
      {
        project: "200",
        summary:
          "• Deploy\n\n[Done]\n• OPS-9: Patch server\n\n" +
          "[In Progress]\n• OPS-8: Rotate keys",
      },
      {
        project: "100",
        summary:
          "[Done]\n• DR-2: Fix login\n\n[In Progress]\n• DR-1: Add tests",
      },
    ]);
  });

  it("puts unmapped tasks in the default project's bucket, joining its mapped bucket", () => {
    const { submitEntries } = buildSubmission({
      selectedKeys: ["DR-1", "XX-5", "favorite:Standup"],
      allIssues: [
        issue("DR-1", "Add tests", "In Progress"),
        issue("XX-5", "Unmapped work", "Done"),
        favoriteIssue("Standup"),
      ],
      createdKeys: new Set(),
      projectMap: { DR: "100" },
      defaultProject: "100",
      favorites: [{ text: "Standup", project_key: null }],
    });
    expect(submitEntries).toEqual([
      {
        project: "100",
        summary:
          "• Standup\n\n[Done]\n• XX-5: Unmapped work\n\n" +
          "[In Progress]\n• DR-1: Add tests",
      },
    ]);
  });

  it("merges unmapped tasks into row 1 when no default project is set", () => {
    const { submitEntries } = buildSubmission({
      selectedKeys: ["DR-1", "XX-5", "favorite:Standup"],
      allIssues: [
        issue("DR-1", "Add tests", "In Progress"),
        issue("XX-5", "Unmapped work", "Done"),
        favoriteIssue("Standup"),
      ],
      createdKeys: new Set(),
      projectMap: { DR: "100" },
      defaultProject: null,
      favorites: [{ text: "Standup", project_key: null }],
    });
    expect(submitEntries).toEqual([
      {
        project: "100",
        summary:
          "• Standup\n\n[Done]\n• XX-5: Unmapped work\n\n" +
          "[In Progress]\n• DR-1: Add tests",
      },
    ]);
  });

  it("merges buckets past the 3 form rows into row 3", () => {
    // 3 mapped buckets + a distinct default-project bucket = 4 buckets.
    const { submitEntries } = buildSubmission({
      selectedKeys: ["A-1", "A-2", "A-3", "B-1", "B-2", "C-1", "XX-1"],
      allIssues: [
        issue("A-1", "a1", "Done"),
        issue("A-2", "a2", "Done"),
        issue("A-3", "a3", "Done"),
        issue("B-1", "b1", "Done"),
        issue("B-2", "b2", "Done"),
        issue("C-1", "c1", "Done"),
        issue("XX-1", "x1", "Done"),
      ],
      createdKeys: new Set(),
      projectMap: { A: "1", B: "2", C: "3" },
      defaultProject: "4",
      favorites: [],
    });
    expect(submitEntries).toEqual([
      { project: "1", summary: "[Done]\n• A-1: a1\n• A-2: a2\n• A-3: a3" },
      { project: "2", summary: "[Done]\n• B-1: b1\n• B-2: b2" },
      { project: "3", summary: "[Done]\n• C-1: c1\n• XX-1: x1" },
    ]);
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

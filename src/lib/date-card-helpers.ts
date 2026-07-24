import type { JiraIssue } from "@/type";

export function buildSummary(issues: JiraIssue[]): string {
  if (!issues.length) return "";
  const byStatus = issues.reduce<Record<string, JiraIssue[]>>((acc, issue) => {
    acc[issue.fields.status.name] = [
      ...(acc[issue.fields.status.name] ?? []),
      issue,
    ];
    return acc;
  }, {});
  return Object.entries(byStatus)
    .toSorted((a, b) => a[0].localeCompare(b[0]))
    .map(
      ([status, statusIssues]) =>
        `[${status}]\n${statusIssues
          .toSorted((a, b) => a.key.localeCompare(b.key))
          .map((issue) => `• ${issue.key}: ${issue.fields.summary}`)
          .join("\n")}`,
    )
    .join("\n\n");
}

// "Today"/"Yesterday", the weekday name within the last week, then "N days
// ago". Diffed at UTC midnight so a DST shift can't skew the day count.
export function getDateRelation(
  date: string,
  locale: string,
  today: string,
  yesterday: string,
  daysAgo: (dayCount: number) => string,
): string | null {
  const [year, month, day] = date.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    return null;
  }
  const dateUtc = Date.UTC(year, month - 1, day);
  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((todayUtc - dateUtc) / 86_400_000);
  if (Number.isNaN(diffDays) || diffDays < 0) return null;
  if (diffDays === 0) return today;
  if (diffDays === 1) return yesterday;
  if (diffDays < 7) {
    return new Date(dateUtc).toLocaleDateString(
      locale === "th" ? "th-TH" : "en-US",
      {
        weekday: "long",
        timeZone: "UTC",
      },
    );
  }
  return daysAgo(diffDays);
}

export function getDateAfter(date: string): string {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + 1);
  const result = d.toISOString().split("T")[0];
  if (!result) throw new Error("Invalid date");
  return result;
}

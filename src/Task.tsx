import { JiraIssue } from "./type";
import { useJiraTasks } from "./useJiraTasks";

type Props = {
  date: Date;
};
export default function Task({ date }: Props) {
  const { data, isLoading, error } = useJiraTasks(date);
  return (
    <li
      className="flex gap-16 border"
      onClick={() => console.log(data?.issues)}
    >
      <p className="flex-none">{date.toISOString().split("T")[0]}</p>
      <div className="flex flex-col gap-2">
        {isLoading
          ? "Loading..."
          : error
            ? "Error: " + error
            : !data
              ? "Error: No data"
              : Object.entries(
                  data.issues.reduce<Record<string, JiraIssue[]>>(
                    (acc, issue) => {
                      acc[issue.fields.status.name] = [
                        ...(acc[issue.fields.status.name] ?? []),
                        issue,
                      ];
                      return acc;
                    },
                    {},
                  ),
                ).map(([status, issues]) => (
                  <div key={status} className="flex flex-col gap-4">
                    <div>{status}</div>
                    <ul className="flex flex-col gap-2">
                      {issues.map((e) => (
                        <li key={e.key}>
                          {"  "}{e.key} {e.fields.summary}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
      </div>
    </li>
  );
}

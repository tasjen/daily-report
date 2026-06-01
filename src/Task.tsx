import { Copy, CopyCheck } from "lucide-react";
import { Button } from "./components/shared/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "./components/shared/card";
import { JiraIssue } from "./type";
import { useJiraTasks } from "./useJiraTasks";
import { useState } from "react";

type Props = {
  date: Date;
};
export default function Task({ date }: Props) {
  const { data, isLoading, error } = useJiraTasks(date);
  const [isCopied, setIsCopied] = useState(false);
  const summaryText = !data
    ? ""
    : Object.entries(
        data.issues.reduce<Record<string, JiraIssue[]>>((acc, issue) => {
          acc[issue.fields.status.name] = [
            ...(acc[issue.fields.status.name] ?? []),
            issue,
          ];
          return acc;
        }, {}),
      )
        .map(
          ([status, issues]) =>
            `[${status}]\n${issues.map((i) => `${i.key}: ${i.fields.summary}`).join("\n")}`,
        )
        .join("\n");
  return (
    <Card onClick={() => console.log(data?.issues)}>
      <CardHeader className="flex-none">
        <CardTitle>{date.toISOString().split("T")[0]}</CardTitle>
        {summaryText && (
          <CardAction>
            <Button
              disabled={isCopied}
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(summaryText);
                setIsCopied(true);
                setTimeout(() => setIsCopied(false), 2000);
              }}
            >
              {isCopied ? <CopyCheck /> : <Copy />}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      {isLoading ? (
        "Loading..."
      ) : error ? (
        "Error: " + error
      ) : !data ? (
        "Error: No data"
      ) : (
        <CardContent>
          <p className="whitespace-pre-wrap">{summaryText}</p>
        </CardContent>
      )}
    </Card>
  );
}

import { Copy, CopyCheck, Loader2, Play, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "./components/shared/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "./components/shared/card";
import { Separator } from "./components/shared/separator";
import { useSubmitTaskMutation } from "./lib/mutations";
import { useJiraTasks } from "./lib/queries";
import { cn } from "./lib/utils";
import type { JiraIssue } from "./type";

type Props = {
  date: string;
};
export default function DateCard({ date }: Props) {
  const { data, error, refetch, isFetching } = useJiraTasks(date, {
    refetchOnMount: "always",
  });
  const [isCopied, setIsCopied] = useState(false);
  const { mutate: submitTask } = useSubmitTaskMutation();

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
            `[${status}]\n${issues
              .sort((a, b) => a.key.localeCompare(b.key))
              .map((i) => `${i.key}: ${i.fields.summary}`)
              .join("\n")}`,
        )
        .join("\n\n");

  return (
    <Card onClick={() => console.log(data?.issues)}>
      <CardHeader className="flex-none flex gap-2 items-center">
        <CardTitle className="flex-1">{date}</CardTitle>
        <Button
          size="icon-lg"
          variant="ghost"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw />
        </Button>
        <Button
          variant="secondary"
          onClick={() => submitTask({ date, summary: summaryText })}
        >
          <Play />
        </Button>
      </CardHeader>
      <Separator />
      <CardContent className="relative">
        {isFetching ? (
          <Loader2 className="animate-spin" />
        ) : error ? (
          `Error: ${error}`
        ) : !data ? (
          "Error: No data"
        ) : (
          <>
            <p
              className={cn(
                "whitespace-pre-wrap mt-2",
                !summaryText && "text-muted-foreground italic",
              )}
            >
              {summaryText || "ไม่พบ Jira issue"}
            </p>
            {summaryText && (
              <Button
                variant="ghost"
                className="absolute -top-2 right-2"
                onClick={async () => {
                  if (isCopied) return;
                  await navigator.clipboard.writeText(summaryText);
                  setIsCopied(true);
                  setTimeout(() => setIsCopied(false), 2000);
                }}
              >
                {isCopied ? <CopyCheck /> : <Copy />}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

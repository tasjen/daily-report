import { Copy, CopyCheck, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "./components/shared/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "./components/shared/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/shared/select";
import { Separator } from "./components/shared/separator";
import type { JiraIssue } from "./type";
import { useJiraTasks } from "./useJiraTasks";
import { useTaskOptions } from "./useTaskOptions";

type Props = {
  date: string;
};
export default function Task({ date }: Props) {
  const { data, error, refetch, isFetching } = useJiraTasks(date);
  const { data: taskOptions } = useTaskOptions();
  const [isCopied, setIsCopied] = useState(false);
  // const leaveOptions = taskOptions?.leaves ?? [];
  const projectOptions = taskOptions?.projects ?? [];
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
        .join("\n\n");

  return (
    <Card onClick={() => console.log(data?.issues)}>
      <CardHeader className="flex-none flex gap-2 items-center">
        <CardTitle>{date}</CardTitle>
        <Select
          items={projectOptions}
          defaultValue={projectOptions[0].value}
          required
        >
          <SelectTrigger className="w-45">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {projectOptions.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button
          size="icon-lg"
          variant="ghost"
          className="ml-auto"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw />
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
            <p className="whitespace-pre-wrap mt-2">
              {summaryText || "No tasks"}
            </p>
            {summaryText && (
              <Button
                disabled={isCopied}
                variant="ghost"
                className="absolute -top-2 right-2"
                onClick={async () => {
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

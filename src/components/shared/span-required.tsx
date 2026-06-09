import { cn } from "@/lib/utils";

export default function SpanRequired({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span className={cn("text-red-500", className)} {...props}>
      *
    </span>
  );
}

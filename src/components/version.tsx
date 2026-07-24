import { getVersion } from "@tauri-apps/api/app";
import { use } from "react";

import { cn } from "@/lib/utils";

type Props = React.ComponentProps<"span">;
export default function Version({ className, ...props }: Props) {
  const version = use(getVersion());
  return (
    <span className={cn("text-xs text-gray-500", className)} {...props}>
      v{version}
    </span>
  );
}

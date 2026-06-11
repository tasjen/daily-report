import { CheckIcon, MoonIcon, SunIcon } from "lucide-react";

import { Button } from "@/components/shared/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/shared/dropdown-menu";
import { useTheme } from "@/theme-provider";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xl"
            className="mr-auto not-hover:text-ring"
          >
            <SunIcon className="size-6 dark:hidden" />
            <MoonIcon className="size-6 not-dark:hidden" />
            <span className="sr-only">Toggle theme</span>
          </Button>
        }
      ></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(["light", "dark", "system"] as const).map((t) => (
          <DropdownMenuItem key={t} onClick={() => setTheme(t)}>
            <span className="first-letter:uppercase">{t}</span>
            {t === theme && <CheckIcon className="ml-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

import { CheckIcon, MoonIcon, SunIcon } from "lucide-react";

import { Button } from "@/components/shared/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/shared/dropdown-menu";
import { useTheme } from "@/theme-provider";
import { Label } from "./components/shared/label";

export default function ThemeSelect() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex gap-2">
      <Label>Theme</Label>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xl"
              className="not-hover:text-ring"
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
    </div>
  );
}

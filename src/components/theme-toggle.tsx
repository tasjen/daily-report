import { Trans } from "@lingui/react/macro";
import { MoonIcon, SunIcon } from "lucide-react";

import { Button } from "@/components/shared/button";
import { Label } from "@/components/shared/label";
import { useTheme } from "@/components/theme-provider";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex gap-2">
      <Label>
        <Trans>Theme</Trans>
      </Label>
      <Button
        variant="outline"
        size="icon-xl"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        <SunIcon className="size-6 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <MoonIcon className="absolute size-6 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span className="sr-only">
          <Trans>Toggle theme</Trans>
        </span>
      </Button>
    </div>
  );
}

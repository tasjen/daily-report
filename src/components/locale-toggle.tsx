import { Trans, useLingui } from "@lingui/react/macro";

import { Button } from "@/components/shared/button";
import { Label } from "@/components/shared/label";
import { activateLocale, LOCALES, type Locale } from "@/lib/i18n";

export default function LocaleToggle() {
  const { i18n } = useLingui();
  const locale = i18n.locale as Locale;
  const nextLocale: Locale = locale === "en" ? "th" : "en";

  return (
    <div className="flex gap-2">
      <Label>
        <Trans>Language</Trans>
      </Label>
      <Button
        variant="outline"
        size="icon-xl"
        onClick={() => activateLocale(nextLocale)}
      >
        {LOCALES[locale]}
        <span className="sr-only">
          <Trans>Switch language</Trans>
        </span>
      </Button>
    </div>
  );
}

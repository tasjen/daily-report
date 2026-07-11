import { type AnyFieldApi, useForm } from "@tanstack/react-form";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLinkIcon, UserIcon } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/shared/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/shared/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/shared/field";
import { Input } from "@/components/shared/input";
import { ScrollArea } from "@/components/shared/scroll-area";
import SpanRequired from "@/components/shared/span-required";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shared/tooltip";
import SignOutButton from "@/components/sign-out-button";
import { useSaveAccountMutation } from "@/lib/mutations";
import { useAccount } from "@/lib/queries";

const jiraTokenUrl =
  "https://id.atlassian.com/manage-profile/security/api-tokens";

const formSchema = z.object({
  phone: z.string().trim().min(1, "Phone number is required"),
  email: z
    .string()
    .trim()
    .min(1, "Jira email is required")
    .pipe(z.email("Enter a valid email address")),
  api_token: z.string().trim().min(1, "Jira API token is required"),
  portal_url: z
    .string()
    .trim()
    .min(1, "Portal URL is required")
    .pipe(z.url({ protocol: /^https?$/, error: "Enter a valid http(s) URL" })),
  portal_credential: z
    .string()
    .trim()
    .min(1, "Portal credential is required")
    .refine((value) => value.includes(":"), "Use the username:password format"),
});

// Renders one labelled text input wired to a TanStack Form field. `field` is
// typed as AnyFieldApi (the library's escape hatch for reusable field
// components), which is fine here since every field holds a string.
function TextField({
  field,
  label,
  type,
}: {
  field: AnyFieldApi;
  label: React.ReactNode;
  type: React.HTMLInputTypeAttribute;
}) {
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Input
        id={field.name}
        name={field.name}
        type={type}
        value={field.state.value}
        onBlur={field.handleBlur}
        // none of the account fields legitimately contain whitespace, so strip
        // it as the user types — also cleans stray spaces/newlines on paste,
        // which zod's .trim() only validates against but never removes from
        // the submitted value
        onChange={(e) => field.handleChange(e.target.value.replaceAll(" ", ""))}
        aria-invalid={isInvalid}
        autoComplete="off"
      />
      {isInvalid && <FieldError errors={field.state.meta.errors} />}
    </Field>
  );
}

export default function AccountForm() {
  const { data: account } = useAccount();
  const saveAccount = useSaveAccountMutation();
  // Open automatically until fully configured: covers both a fresh install
  // (no account at all) and an existing store saved before the portal fields
  // existed. Any account saved through this form always has every field, so
  // checking the two newest fields subsumes the old `!account` check.
  const [open, setOpen] = useState(
    !account?.portal_url || !account?.portal_credential,
  );

  const form = useForm({
    defaultValues: {
      phone: account?.phone ?? "",
      email: account?.email ?? "",
      api_token: account?.api_token ?? "",
      portal_url: account?.portal_url ?? "",
      portal_credential: account?.portal_credential ?? "",
    },
    validators: { onChange: formSchema },
    onSubmit: ({ value }) => {
      // TanStack Form submits the raw field values, not zod's parsed output,
      // so schema transforms would never reach `value` — normalize the
      // trailing slash here (the backend joins with `{base_url}/task.php`).
      saveAccount.mutate({
        ...value,
        portal_url: value.portal_url.replace(/\/+$/, ""),
      });
      setOpen(false);
    },
  });

  function handleOpenChange(next: boolean) {
    // restore the saved account values (and clear any unsaved edits/errors)
    // each time the dialog opens, mirroring the previous reset-on-open behavior
    if (next) {
      form.reset({
        phone: account?.phone ?? "",
        email: account?.email ?? "",
        api_token: account?.api_token ?? "",
        portal_url: account?.portal_url ?? "",
        portal_credential: account?.portal_credential ?? "",
      });
    }
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button size="icon-xl" variant="ghost">
            <UserIcon className="size-6" />
          </Button>
        }
      />
      <DialogContent
        render={
          <form
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
          />
        }
        initialFocus={false}
        className="gap-0"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserIcon />
            Account
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="-mr-3 max-h-[60dvh] pt-4 pr-3">
          <FieldGroup className="pb-4">
            <form.Field name="portal_url">
              {(field) => (
                <TextField
                  field={field}
                  type="url"
                  label={
                    <>
                      Portal URL <SpanRequired />
                    </>
                  }
                />
              )}
            </form.Field>

            <form.Field name="portal_credential">
              {(field) => (
                <TextField
                  field={field}
                  type="password"
                  label={
                    <>
                      Portal credential <SpanRequired />
                    </>
                  }
                />
              )}
            </form.Field>

            <form.Field name="phone">
              {(field) => (
                <TextField
                  field={field}
                  type="tel"
                  label={
                    <>
                      Phone number <SpanRequired />
                    </>
                  }
                />
              )}
            </form.Field>

            <form.Field name="email">
              {(field) => (
                <TextField
                  field={field}
                  type="email"
                  label={
                    <>
                      Jira email <SpanRequired />
                    </>
                  }
                />
              )}
            </form.Field>

            <form.Field name="api_token">
              {(field) => (
                <TextField
                  field={field}
                  type="password"
                  label={
                    <>
                      Jira API token <SpanRequired />
                      <Tooltip>
                        <TooltipTrigger
                          className="cursor-pointer"
                          onClick={() => openUrl(jiraTokenUrl)}
                          render={
                            <span>
                              <ExternalLinkIcon size={16} className="inline" />
                            </span>
                          }
                        />
                        <TooltipContent className="max-w-none">
                          <p
                            className="cursor-pointer font-semibold hover:underline"
                            onClick={() => openUrl(jiraTokenUrl)}
                          >
                            {jiraTokenUrl}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </>
                  }
                />
              )}
            </form.Field>
          </FieldGroup>
        </ScrollArea>
        <DialogFooter>
          <SignOutButton />
          <form.Subscribe selector={(state) => state.canSubmit}>
            {(canSubmit) => (
              <Button type="submit" className="flex-1" disabled={!canSubmit}>
                Save
              </Button>
            )}
          </form.Subscribe>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

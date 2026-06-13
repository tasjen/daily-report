import { useForm } from "@tanstack/react-form";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLinkIcon, UserIcon } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import ResetAppButton from "@/components/reset-app-button";
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
import SpanRequired from "@/components/shared/span-required";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shared/tooltip";
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
});

export default function AccountForm() {
  const { data: account } = useAccount();
  const saveAccount = useSaveAccountMutation();
  const [open, setOpen] = useState(!account);

  const form = useForm({
    defaultValues: {
      phone: account?.phone ?? "",
      email: account?.email ?? "",
      api_token: account?.api_token ?? "",
    },
    validators: { onChange: formSchema },
    onSubmit: ({ value }) => {
      saveAccount.mutate(value);
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
      <DialogContent initialFocus={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserIcon />
            Account
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <form.Field name="phone">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>
                      Phone number <SpanRequired />
                    </FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="tel"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={isInvalid}
                      autoComplete="off"
                    />
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                );
              }}
            </form.Field>

            <form.Field name="email">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>
                      Jira email <SpanRequired />
                    </FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="email"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={isInvalid}
                      autoComplete="off"
                    />
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                );
              }}
            </form.Field>

            <form.Field name="api_token">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>
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
                    </FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="password"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={isInvalid}
                      autoComplete="off"
                    />
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                );
              }}
            </form.Field>
          </FieldGroup>

          <DialogFooter>
            <ResetAppButton />
            <form.Subscribe selector={(state) => state.canSubmit}>
              {(canSubmit) => (
                <Button type="submit" className="flex-1" disabled={!canSubmit}>
                  Save
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

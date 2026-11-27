import { zodResolver } from "@hookform/resolvers/zod";
import type { MutableRefObject } from "react";
import { useUnsavedInput } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { Button } from "@/shared/ui/button";
import { Form, FormRoot, useFieldForm } from "@/shared/ui/form";
import { TextField } from "@/shared/ui/input";
import { BUSY_LOOK } from "@/shared/lib/utils";
import { texts } from "@/shared/lib/text-rules/texts";
import { DAYS, invitationDaysSchema, type InvitationDaysFields } from "../../../schemas";
import partsTable from "../operator-parts.de.json";

const t = texts(partsTable);

/**
 * The days field and the button; a value outside the limits is refused before anything is sent. `focusRef` receives
 * the days field so a neighbour (the empty list) can move the focus there.
 */
export function InvitationForm(props: {
  running: boolean;
  /** Resolves true when the code was created; the days field is then empty of unsaved input (US-QS-32). */
  onCreate: (days: number) => Promise<boolean>;
  focusRef?: MutableRefObject<HTMLInputElement | null>;
}) {
  const form = useFieldForm<InvitationDaysFields>({
    resolver: zodResolver(invitationDaysSchema),
    defaultValues: { days: String(DAYS.default) },
  });
  // Typed input that is not saved asks before the layer closes (US-QS-32).
  useUnsavedInput(form.formState.isDirty);
  const submit = form.handleSubmit(async (v) => {
    if (await props.onCreate(Number(v.days))) form.reset(v);
  });
  return (
    <Form {...form}>
      <FormRoot onSubmit={submit} className="flex max-w-xl flex-col gap-4">
        <TextField
          control={form.control}
          name="days"
          label={t("days.label")}
          focusRef={props.focusRef}
          type="number"
          inputMode="numeric"
          min={DAYS.min}
          max={DAYS.max}
        />
        <Button
          type="submit"
          size="touch"
          needsNetwork
          aria-disabled={props.running || undefined}
          aria-busy={props.running || undefined}
          className={BUSY_LOOK}
        >
          {t("code.create")}
        </Button>
      </FormRoot>
    </Form>
  );
}

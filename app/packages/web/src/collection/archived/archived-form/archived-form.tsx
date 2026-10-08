import { useCallback, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch, type Control } from "react-hook-form";
import { ARCHIVED_REASONS } from "@pflanzendex/core";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormRoot,
} from "@/components/ui/fields/form/form";
import { Input } from "@/components/ui/fields/input/input";
import { Select } from "@/components/ui/fields/select/select";
import type { ApiError } from "../../../kernel";
import { FormButtons, Quiet, TITLE, Warning } from "../../specimens/cards/parts/parts";
import { refusalText, useEdited } from "../../specimens/model/refusal";
import {
  archiveSchema,
  OTHER_REASON,
  reasonOf,
  type ArchiveFields,
} from "../../specimens/model/schemas";

/** The own reason is only asked for after "anderer Grund …" is chosen; it keeps its place in the focus order. */
function OwnReason({ control }: { control: Control<ArchiveFields> }) {
  const choice = useWatch({ control, name: "choice" });
  if (choice !== OTHER_REASON) return null;
  return (
    <FormField
      control={control}
      name="free"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Eigener Grund</FormLabel>
          <FormControl>
            <Input {...field} maxLength={250} autoComplete="off" />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** The reason from the list, or "anderer Grund …" to type an own one. */
function ReasonChoice({ control }: { control: Control<ArchiveFields> }) {
  return (
    <FormField
      control={control}
      name="choice"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Grund</FormLabel>
          <FormControl>
            <Select {...field}>
              {ARCHIVED_REASONS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
              <option value={OTHER_REASON}>anderer Grund …</option>
            </Select>
          </FormControl>
        </FormItem>
      )}
    />
  );
}

/**
 * Archive a specimen (US-BES-07): a reason from the list or an own one. The form says beforehand what happens (P-09)
 * and that it can be undone (P-10).
 */
export function ArchiveForm(props: {
  name: string;
  onSend: (reason: string) => Promise<ApiError | null>;
  onCancel: () => void;
}) {
  const form = useForm<ArchiveFields>({
    resolver: zodResolver(archiveSchema),
    defaultValues: { choice: ARCHIVED_REASONS[0], free: "" },
  });
  const [error, setError] = useState<ApiError | null>(null);
  useEdited(
    form,
    useCallback(() => setError(null), []),
  );
  const submit = form.handleSubmit(async (values) =>
    setError(await props.onSend(reasonOf(values))),
  );
  return (
    <section aria-labelledby="archive-title">
      <h1 id="archive-title" className={TITLE}>
        Exemplar archivieren
      </h1>
      <p className="mb-2 text-muted-foreground">
        „{props.name}“ verschwindet aus der Liste und aus den Auswertungen.
      </p>
      <Quiet className="mb-5">
        Die Historie bleibt erhalten. Im Archiv kannst du es jederzeit wiederherstellen.
      </Quiet>
      <Form {...form}>
        <FormRoot
          onSubmit={submit}
          aria-label="Exemplar archivieren"
          className="flex max-w-xl flex-col gap-4"
        >
          <ReasonChoice control={form.control} />
          <OwnReason control={form.control} />
          {error && (
            <Warning>
              <p>{refusalText(error)}</p>
            </Warning>
          )}
          <FormButtons
            submit="Archivieren"
            cancel="Abbrechen"
            pending={form.formState.isSubmitting}
            onCancel={props.onCancel}
          />
        </FormRoot>
      </Form>
    </section>
  );
}

import { useCallback, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useWatch, type Control } from "react-hook-form";
import { ARCHIVED_REASONS } from "@pflanzendex/core";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormRoot,
  useFieldForm,
} from "@/shared/ui/form";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import type { ApiError } from "../../../shared/data";
import { FormButtons, Quiet, ErrorNotice } from "../../specimens/cards/parts/parts";
import { refusalText } from "@/shared/lib/error-text";
import { texts } from "@/shared/lib/text-rules/texts";
import { PageHeader } from "@/shared/patterns/navigation/page-header/page-header";
import { useEdited } from "../../specimens/model/refusal";
import {
  archiveSchema,
  OTHER_REASON,
  reasonOf,
  type ArchiveFields,
} from "../../specimens/model/schemas";

import table from "./archived-form.de.json";
const tx = texts(table);

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
  const form = useFieldForm<ArchiveFields>({
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
    <section aria-labelledby="archive-title" className="flex min-w-0 flex-col gap-2">
      <PageHeader
        headingId="archive-title"
        title={tx("title")}
        subject={props.name}
        back={{ label: tx("back", { name: props.name }), onBack: props.onCancel }}
      />
      <p className="mb-2 text-muted-foreground">
        „{props.name}“ verschwindet aus der Liste und aus den Auswertungen.
      </p>
      <Quiet className="mb-5">
        Die Historie bleibt erhalten. Im Archiv kannst du es jederzeit wiederherstellen.
      </Quiet>
      <Form {...form}>
        <FormRoot
          onSubmit={submit}
          aria-label="Pflanze archivieren"
          className="flex max-w-xl flex-col gap-4"
        >
          <ReasonChoice control={form.control} />
          <OwnReason control={form.control} />
          {error && (
            <ErrorNotice>
              <p>{refusalText(error)}</p>
            </ErrorNotice>
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

import { useEffect, useRef } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type UseFormReturn, type UseFormSetError } from "react-hook-form";
import { Button } from "@/components/ui/button/button";
import { Form, FormRoot } from "@/components/ui/fields/form/form";
import { errorText } from "@/lib/error-text";
import type { ApiError } from "../../kernel";
import { OptionalFields, RequiredFields, ZoneField } from "./fields/fields";
import {
  EMPTY_FIELDS,
  equipmentSchema,
  fieldsOfRefusal,
  toEquipmentInput,
  type EquipmentFields,
} from "../schemas";
import type { EquipmentInput } from "../equipment-api";
import type { EquipmentPrefill } from "../overviews/wishes-view/wishes-api";

/** Hands a server refusal to the form: the fields it names get the German text of its error code (P-10). */
function useServerRefusal(error: ApiError | null, setError: UseFormSetError<EquipmentFields>) {
  const alertRef = useRef<HTMLDivElement>(null);
  const named = error ? fieldsOfRefusal(error) : [];
  const alertText = error && named.length === 0 ? errorText(error.code) : null;
  useEffect(() => {
    if (!error) return;
    const fields = fieldsOfRefusal(error);
    fields.forEach((field, i) =>
      setError(field, { type: "server", message: errorText(error.code) }, { shouldFocus: i === 0 }),
    );
    if (fields.length === 0) alertRef.current?.focus();
  }, [error, setError]);
  return { alertText, alertRef };
}

/** "Gekauft" on an equipment wish fills the form with what the wish knows (US-EQU-08); the rest stays empty (P-08). */
function usePrefill(
  form: UseFormReturn<EquipmentFields>,
  prefill: EquipmentPrefill | null | undefined,
) {
  useEffect(() => {
    if (!prefill) return;
    form.reset({
      ...EMPTY_FIELDS,
      type: prefill.type,
      name: prefill.name,
      productId: prefill.productId ?? "",
      priceEur: prefill.priceEur === null ? "" : String(prefill.priceEur).replace(".", ","),
    });
  }, [prefill, form]);
}

/** Optional fields stay behind "Mehr Angaben"; a prefill or a refusal on one of them opens the group (P-10). */
function hasOptional(prefill: EquipmentPrefill | null | undefined, refused: string[]): boolean {
  const required = ["type", "name", "lightZoneId"];
  return (
    Boolean(prefill?.productId || prefill?.priceEur) || refused.some((k) => !required.includes(k))
  );
}

/** The form to record equipment (US-EQU-01): only type and name are required, the rest stays unknown (P-08). */
export function EquipmentForm(props: {
  zones: readonly { zoneId: string; name: string }[];
  /** Set by "Gekauft" on an equipment wish: fills type, name, product id and price (US-EQU-08). */
  prefill?: EquipmentPrefill | null;
  running: boolean;
  message: string | null;
  error: ApiError | null;
  /** Resolves true when the equipment was saved, so the form can be emptied. */
  onSend: (input: EquipmentInput) => Promise<boolean>;
}) {
  const form = useForm<EquipmentFields>({
    resolver: zodResolver(equipmentSchema),
    defaultValues: EMPTY_FIELDS,
  });
  const { alertText, alertRef } = useServerRefusal(props.error, form.setError);
  usePrefill(form, props.prefill);
  const refused = Object.keys(form.formState.errors).length > 0;
  const moreOpen = hasOptional(props.prefill, Object.keys(form.formState.errors));
  const pending = props.running || form.formState.isSubmitting;
  const submit = form.handleSubmit(async (values) => {
    if (await props.onSend(toEquipmentInput(values))) form.reset(EMPTY_FIELDS);
  });
  return (
    <section aria-labelledby="equipment-form-title" className="flex flex-col gap-3">
      <h2 id="equipment-form-title" className="sr-only">
        Equipment erfassen
      </h2>
      {props.message && !refused && (
        <p role="status" className="rounded-lg border border-border p-3">
          {props.message}
        </p>
      )}
      {alertText !== null && (
        <div
          role="alert"
          tabIndex={-1}
          ref={alertRef}
          className="rounded-lg border border-destructive p-3 text-destructive"
        >
          <p>{alertText}</p>
        </div>
      )}
      <Form {...form}>
        <FormRoot onSubmit={submit} className="flex max-w-xl flex-col gap-4">
          <RequiredFields control={form.control} />
          <ZoneField control={form.control} zones={props.zones} />
          <details open={moreOpen || undefined} className="rounded-lg border border-border">
            <summary className="cursor-pointer p-3">Mehr Angaben</summary>
            <div className="flex flex-col gap-4 px-3 pb-3">
              <OptionalFields control={form.control} />
            </div>
          </details>
          <Button type="submit" size="touch" disabled={pending}>
            {pending ? "Speichert …" : "Equipment speichern"}
          </Button>
        </FormRoot>
      </Form>
    </section>
  );
}

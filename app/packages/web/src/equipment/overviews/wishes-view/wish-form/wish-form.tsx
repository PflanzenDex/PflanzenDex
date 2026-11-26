import { zodResolver } from "@hookform/resolvers/zod";
import { type Control } from "react-hook-form";
import { EQUIPMENT_LIMITS, EQUIPMENT_TYPES } from "@pflanzendex/core";
import { Button } from "@/shared/ui/button";
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
import { useUnsavedInput } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { Select } from "@/shared/ui/select";
import { TYPE_LABELS } from "../../../labels";
import { EMPTY_WISH, toWishInput, wishSchema, type WishFields } from "../../../schemas";
import type { EquipmentWishInput } from "../wishes-api";

type TextName = "name" | "productId" | "priceEur";

/** The optional ones say so after the label (SG-FORM-01); a unit stands as the suffix inside the field. */
const TEXTS: {
  name: TextName;
  label: string;
  optional?: boolean;
  suffix?: string;
  max?: number;
  decimal?: boolean;
}[] = [
  { name: "name", label: "Name des Wunsches", max: EQUIPMENT_LIMITS.name.max },
  {
    name: "productId",
    label: "Produkt-ID des Wunsches",
    optional: true,
    max: EQUIPMENT_LIMITS.productId.max,
  },
  { name: "priceEur", label: "Geplanter Preis", optional: true, suffix: "€", decimal: true },
];

function TypeField({ control }: { control: Control<WishFields> }) {
  return (
    <FormField
      control={control}
      name="type"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Art des Wunsches</FormLabel>
          <FormControl>
            <Select {...field}>
              <option value="">Bitte wählen</option>
              {EQUIPMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** The form to record an equipment wish (US-EQU-08): only type and name are required, the rest stays unknown (P-08). */
export function WishForm(props: {
  busy: boolean;
  /** Resolves true when the wish was saved, so the form can be emptied. */
  onCreate: (input: EquipmentWishInput) => Promise<boolean>;
}) {
  const form = useFieldForm<WishFields>({
    resolver: zodResolver(wishSchema),
    defaultValues: EMPTY_WISH,
  });
  // Typed input that is not saved asks before the layer closes (US-QS-32).
  useUnsavedInput(form.formState.isDirty);
  const submit = form.handleSubmit(async (values) => {
    if (await props.onCreate(toWishInput(values))) form.reset(EMPTY_WISH);
  });
  return (
    <Form {...form}>
      <FormRoot
        onSubmit={submit}
        className="flex max-w-xl flex-col gap-3"
        aria-label="Geräte-Wunsch erfassen"
      >
        <TypeField control={form.control} />
        {TEXTS.map((t) => (
          <FormField
            key={t.name}
            control={form.control}
            name={t.name}
            render={({ field }) => (
              <FormItem>
                <FormLabel optional={t.optional}>{t.label}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    autoComplete="off"
                    suffix={t.suffix}
                    {...(t.max ? { maxLength: t.max } : {})}
                    {...(t.decimal ? { inputMode: "decimal" as const } : {})}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}
        <Button type="submit" size="touch" disabled={props.busy || form.formState.isSubmitting}>
          Wunsch sichern
        </Button>
      </FormRoot>
    </Form>
  );
}

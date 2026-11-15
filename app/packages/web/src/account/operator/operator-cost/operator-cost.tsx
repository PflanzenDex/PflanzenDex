import type { CostPerUser, OperatorCostFigure } from "@pflanzendex/core";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Control } from "react-hook-form";
import { Button } from "@/shared/ui/button/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormRoot,
} from "@/shared/ui/fields/form/form";
import { TextField } from "@/shared/ui/fields/input/input";
import { MonthField } from "@/shared/ui/fields/input/native-fields/month-field/month-field";
import { BUSY_LOOK, cn } from "@/shared/lib/utils";
import { useUnsavedInput } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { costSchema, parseAmount, type CostFields } from "../../schemas";

/** An amount in cents as money in German notation, e.g. `1.234,50 €`. */
export const moneyText = (cents: number, currency: string): string =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(cents / 100);

/** `2026-10` as `Oktober 2026`. */
export function monthText(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year ?? 2000, (m ?? 1) - 1, 1)));
}

/**
 * The cost per active account with its source, or "unbekannt" with the reason (P-08). Without a figure the value is "unbekannt"
 * alone: the sheet shows the button that enters the figure (US-QS-15, operator-parts).
 */
export function costPerUserText(c: CostPerUser): string {
  if (c.known)
    return `${moneyText(c.amountCents, c.currency)} (${monthText(c.month)}, manuell eingetragen)`;
  return c.reason === "no_figure" ? "unbekannt" : "unbekannt: es gibt noch keine aktiven Konten";
}

/** The current month as `YYYY-MM` (UTC, like the rule on the server). */
const thisMonth = () => new Date().toISOString().slice(0, 7);

/** The month of a cost entry as a select with German month names (US-QS-24). */
function MonthRow(props: { control: Control<CostFields>; max: string }) {
  return (
    <FormField
      control={props.control}
      name="month"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Monat</FormLabel>
          <FormControl>
            <MonthField {...field} max={props.max} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** The operator enters the real hosting cost of one month (US-ACC-05, NFR-16); a new entry replaces the old one. */
export function CostForm(props: {
  cost: OperatorCostFigure | null;
  running: boolean;
  /** Resolves true when the figure was saved; the form is then empty of unsaved input (US-QS-32). */
  onSave: (figure: OperatorCostFigure) => Promise<boolean>;
}) {
  const form = useForm<CostFields>({
    resolver: zodResolver(costSchema),
    defaultValues: {
      amount: props.cost ? (props.cost.amountCents / 100).toFixed(2).replace(".", ",") : "",
      currency: props.cost?.currency ?? "EUR",
      month: props.cost?.month ?? thisMonth(),
    },
  });
  // Typed input that is not saved asks before the layer closes (US-QS-32).
  useUnsavedInput(form.formState.isDirty);
  const submit = form.handleSubmit(async (v) => {
    const saved = await props.onSave({
      amountCents: parseAmount(v.amount) ?? 0,
      currency: v.currency.trim().toUpperCase(),
      month: v.month,
    });
    // The layer stays open after a save and shows the notice: the saved values are no unsaved input any more.
    if (saved) form.reset(v);
  });
  return (
    <Form {...form}>
      <FormRoot onSubmit={submit} className="flex max-w-xl flex-col gap-4">
        <TextField control={form.control} name="amount" label="Betrag" inputMode="decimal" />
        <TextField control={form.control} name="currency" label="Währung" maxLength={3} />
        <MonthRow control={form.control} max={thisMonth()} />
        {/* Sticky: the save button stays in view in the layer "Monatliche Kosten" (US-QS-15). */}
        <div className="sticky bottom-0 bg-card py-2">
          <Button
            type="submit"
            size="touch"
            needsNetwork
            className={cn("w-full", BUSY_LOOK)}
            aria-disabled={props.running || undefined}
            aria-busy={props.running || undefined}
          >
            Kosten speichern
          </Button>
        </div>
      </FormRoot>
    </Form>
  );
}

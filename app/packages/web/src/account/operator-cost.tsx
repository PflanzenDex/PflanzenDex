import type { CostPerUser, OperatorCostFigure } from "@pflanzendex/core";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { TextField } from "./text-field";
import { costSchema, parseAmount, type CostFields } from "./schemas";

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

/** The cost per user with its source, or "unbekannt" with the reason and what to do (P-08, P-09). */
export function costPerUserText(c: CostPerUser): string {
  if (c.known)
    return `${moneyText(c.amountCents, c.currency)} (${monthText(c.month)}, manuell eingetragen)`;
  return c.reason === "no_figure"
    ? "unbekannt: trage unten die Kosten eines Monats ein"
    : "unbekannt: es gibt noch keine aktiven Nutzer";
}

/** The current month as `YYYY-MM` (UTC, like the rule on the server). */
const thisMonth = () => new Date().toISOString().slice(0, 7);

/** The operator enters the real hosting cost of one month (US-ACC-05, NFR-16); a new entry replaces the old one. */
export function CostForm(props: {
  cost: OperatorCostFigure | null;
  running: boolean;
  onSave: (figure: OperatorCostFigure) => void;
}) {
  const form = useForm<CostFields>({
    resolver: zodResolver(costSchema),
    defaultValues: {
      amount: props.cost ? (props.cost.amountCents / 100).toFixed(2).replace(".", ",") : "",
      currency: props.cost?.currency ?? "EUR",
      month: props.cost?.month ?? thisMonth(),
    },
  });
  const submit = form.handleSubmit((v) =>
    props.onSave({
      amountCents: parseAmount(v.amount) ?? 0,
      currency: v.currency.trim().toUpperCase(),
      month: v.month,
    }),
  );
  return (
    <Form {...form}>
      <form noValidate onSubmit={(e) => void submit(e)} className="flex max-w-xl flex-col gap-4">
        <TextField control={form.control} name="amount" label="Betrag" inputMode="decimal" />
        <TextField control={form.control} name="currency" label="Währung" maxLength={3} />
        <TextField
          control={form.control}
          name="month"
          label="Monat"
          type="month"
          max={thisMonth()}
        />
        <Button type="submit" size="touch" disabled={props.running}>
          Kosten speichern
        </Button>
      </form>
    </Form>
  );
}

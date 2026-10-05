import { OPERATOR_COST_CENTS, type CostPerUser, type OperatorCostFigure } from "@pflanzendex/core";
import { useState, type FormEvent } from "react";

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

/**
 * `12,50`, `1.234,5` or `1234.50` in cents; `null` if it is no amount with at most two decimals. A comma is the
 * decimal separator if present (dots are then thousands separators), otherwise a dot is.
 */
export function parseAmount(text: string): number | null {
  const t = text.trim().replace(/\s/g, "");
  const plain = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const [whole = "", part = "", ...rest] = plain.split(".");
  if (rest.length > 0 || !/^\d+$/.test(whole) || !/^\d{0,2}$/.test(part)) return null;
  if (plain.endsWith(".")) return null;
  const cents = Number(whole) * 100 + Number(part.padEnd(2, "0"));
  return cents <= OPERATOR_COST_CENTS.max ? cents : null;
}

/** The current month as `YYYY-MM` (UTC, like the rule on the server). */
const thisMonth = () => new Date().toISOString().slice(0, 7);

/** The operator enters the real hosting cost of one month (US-ACC-05, NFR-16); a new entry replaces the old one. */
export function CostForm(props: {
  cost: OperatorCostFigure | null;
  running: boolean;
  onSave: (figure: OperatorCostFigure) => void;
}) {
  const [amount, setAmount] = useState(
    props.cost ? (props.cost.amountCents / 100).toFixed(2).replace(".", ",") : "",
  );
  const [currency, setCurrency] = useState(props.cost?.currency ?? "EUR");
  const [month, setMonth] = useState(props.cost?.month ?? thisMonth());
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const amountCents = parseAmount(amount);
    const code = currency.trim().toUpperCase();
    if (amountCents === null)
      return setProblem(
        "Gib einen Betrag bis 1.000.000 mit höchstens zwei Nachkommastellen ein, zum Beispiel 12,50.",
      );
    if (!/^[A-Z]{3}$/.test(code))
      return setProblem("Gib die Währung mit drei Buchstaben an, zum Beispiel EUR.");
    if (!/^\d{4}-\d{2}$/.test(month))
      return setProblem("Wähle den Monat, zu dem die Kosten gehören.");
    setProblem(null);
    props.onSave({ amountCents, currency: code, month });
  };
  return (
    <form onSubmit={submit} noValidate>
      <label>
        Betrag
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <label>
        Währung
        <input maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value)} />
      </label>
      <label>
        Monat
        <input
          type="month"
          value={month}
          max={thisMonth()}
          onChange={(e) => setMonth(e.target.value)}
        />
      </label>
      {problem && (
        <p role="alert" className="warning">
          {problem}
        </p>
      )}
      <button type="submit" className="primary" disabled={props.running}>
        Kosten speichern
      </button>
    </form>
  );
}

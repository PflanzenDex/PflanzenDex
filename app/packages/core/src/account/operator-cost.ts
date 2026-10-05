import {
  appError,
  defineOperation,
  failed,
  integerField,
  ok,
  shape,
  type ErrorDetail,
} from "../kernel";
import { isOperator, type AccessStore } from "./access";

/** The amount of one month in cents: 0 to 1,000,000.00 (assumption, starting value; the database checks the same). */
export const OPERATOR_COST_CENTS = { min: 0, max: 100_000_000 } as const;

/** The real hosting cost of one month as the operator entered it (US-ACC-05, NFR-16); one per installation. */
export interface OperatorCostFigure {
  readonly amountCents: number;
  /** ISO 4217 code, e.g. `EUR`. */
  readonly currency: string;
  /** The month the figure belongs to, `YYYY-MM`. */
  readonly month: string;
}

/**
 * The cost per user, or why it is unknown (P-08: no invented number). `manual`: it comes from the figure the operator
 * entered, not from a measurement (TE-10 does not exist yet).
 */
export type CostPerUser =
  | {
      readonly known: true;
      readonly amountCents: number;
      readonly currency: string;
      readonly month: string;
      readonly source: "manual";
    }
  | { readonly known: false; readonly reason: "no_figure" | "no_active_accounts" };

/** Amount divided by the active accounts, rounded half up to whole cents; integers only, no floating point. */
export function costPerUser(
  figure: OperatorCostFigure | null,
  activeAccounts: number,
): CostPerUser {
  if (!figure) return { known: false, reason: "no_figure" };
  if (activeAccounts <= 0) return { known: false, reason: "no_active_accounts" };
  const amountCents = Math.floor((2 * figure.amountCents + activeAccounts) / (2 * activeAccounts));
  return {
    known: true,
    amountCents,
    currency: figure.currency,
    month: figure.month,
    source: "manual",
  };
}

const invalid = (field: string): ErrorDetail => ({ field, code: "input.invalid" });

function currencyField(field: string) {
  return (value: unknown): string | ErrorDetail =>
    typeof value === "string" && /^[A-Z]{3}$/.test(value) ? value : invalid(field);
}

/** `YYYY-MM` from 2000 on (assumption: no hosting bill of this app is older). */
function monthField(field: string) {
  return (value: unknown): string | ErrorDetail =>
    typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && value >= "2000-01"
      ? value
      : invalid(field);
}

const schema = shape({
  amountCents: integerField("amountCents", OPERATOR_COST_CENTS),
  currency: currencyField("currency"),
  month: monthField("month"),
});

/**
 * The operator enters the real hosting cost of one month (US-ACC-05, NFR-16, P-03); a new entry replaces the old one.
 * Operator only (a reviewer is not), the database checks the role again. A month after the current month (UTC, by the
 * clock of the server) is refused: a bill for it cannot exist yet.
 */
export const operatorCostSet = (deps: { access: AccessStore; now: () => Date }) =>
  defineOperation({
    name: "operator_cost.set",
    schema,
    authorized: isOperator(deps.access),
    run: async ({ userId }, input) => {
      if (input.month > deps.now().toISOString().slice(0, 7))
        return failed(appError("operator_cost.month_in_future", { details: [invalid("month")] }));
      await deps.access.setOperatorCost(userId, input);
      return ok<OperatorCostFigure>(input);
    },
  });

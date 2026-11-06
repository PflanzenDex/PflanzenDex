import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { useFeature } from "@/shared/data";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button/button";
import { ResponsiveModal } from "@/shared/patterns/responsive/responsive-modal/responsive-modal";
import {
  accountAddress,
  type AccountSection,
} from "@/shared/patterns/navigation/navigation/navigation";
import type { Account } from "@/account";
import { SECTIONS, rowId } from "../account-model/account-model";
import { useAccountValues, type Values } from "./account-values";

/** The rows of the index: every section that is on for the account; the profile has its own row above them. */
function rowsOf(values: Values, ai: boolean | undefined, hasOverview: boolean) {
  return SECTIONS.filter(
    (s) =>
      s.key !== "profile" &&
      (s.key !== "achievements" || values.achievementsShown) &&
      (s.key !== "aiClients" || ai) &&
      (s.key !== "functions" || hasOverview),
  );
}

type Token = () => Promise<string | undefined>;

const ROW =
  "flex min-h-11 w-full items-center gap-3 rounded-lg border-l-4 border-transparent px-3 py-1 text-left text-base text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
/** The rows bleed into the gutter by their bar and padding, so avatar and titles line up with the heading (issue 1099). */
const LIST = "-mx-[calc(0.75rem+4px)] my-0 flex list-none flex-col gap-0 p-0";
const CURRENT = "border-primary bg-accent font-semibold text-accent-foreground hover:bg-accent";
const NOTICE = "rounded-lg border border-warning-border bg-warning p-3 text-warning-foreground";

function Row(props: {
  to: AccountSection;
  id: string;
  current: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      id={props.id}
      to={accountAddress(props.to)}
      aria-current={props.current ? "page" : undefined}
      className={cn(ROW, props.current && CURRENT)}
    >
      {props.children}
      <ChevronRight aria-hidden="true" className="ml-auto size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

/** The confirmation of signing out (US-QS-17): a sheet on a phone, a dialog on a large screen. */
function SignOutRow(props: {
  onSignOut: () => void;
  onEverywhereSignOut: () => void;
  /** The error of the last try (US-ACC-01): the dialog stays open, so the person can press again. */
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* The same row as the sections, with its chevron, so it reads as an action of the list and not as plain text (issue 1045). */}
      <Button
        type="button"
        variant="ghost"
        className={cn(ROW, "h-auto justify-start font-normal")}
        onClick={() => setOpen(true)}
      >
        Abmelden…
        <ChevronRight
          aria-hidden="true"
          className="ml-auto size-4 shrink-0 text-muted-foreground"
        />
      </Button>
      <ResponsiveModal title="Abmelden?" closeLabel="Schließen" open={open} onOpenChange={setOpen}>
        <div className="flex flex-col gap-3">
          {props.error && (
            <p role="alert" className={NOTICE}>
              {props.error}
            </p>
          )}
          <Button type="button" size="touch" onClick={props.onSignOut}>
            Abmelden
          </Button>
          <Button type="button" variant="outline" size="touch" onClick={props.onEverywhereSignOut}>
            Auf allen Geräten abmelden
          </Button>
          <Button type="button" variant="ghost" size="touch" onClick={() => setOpen(false)}>
            Abbrechen
          </Button>
        </div>
      </ResponsiveModal>
    </>
  );
}

/**
 * The index of "Konto" (US-QS-17): the profile row, one row per section with its name and current value, and
 * "Abmelden…". Each row opens its section as a view of its own. The current section is marked by `aria-current`, a
 * bar and bold text, not by colour alone. Sections that are off (calm mode, the keeper's switch of the achievements,
 * function "ai", no overview) have no row.
 */
export function AccountIndex(props: {
  api: string;
  token: Token;
  account: Account;
  /** The section that is open beside the index on a wide screen. */
  current: AccountSection | undefined;
  hasOverview: boolean;
  onSignOut: () => void;
  onEverywhereSignOut: () => void;
  /** The error of a failed sign-out (US-ACC-01), shown in its dialog. */
  error?: string;
}) {
  const ai = useFeature("ai");
  const values = useAccountValues(props.api, props.token);
  const rows = rowsOf(values, ai, props.hasOverview);
  const name = props.account.displayName || props.account.email;
  return (
    <nav aria-label="Abschnitte von Konto">
      <ul className={LIST}>
        <li>
          <Row to="profile" id={rowId("profile")} current={props.current === "profile"}>
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-base font-semibold text-accent-foreground"
            >
              {name.slice(0, 1).toUpperCase()}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="font-semibold [overflow-wrap:anywhere]">{name}</span>
              <span className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                {props.account.email}
              </span>
            </span>
          </Row>
        </li>
        {rows.map((s) => {
          const value = values[s.key];
          return (
            <li key={s.key}>
              <Row to={s.key} id={rowId(s.key)} current={props.current === s.key}>
                <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3">
                  <span>{s.title}</span>
                  {typeof value === "string" && (
                    <span className="text-sm font-normal text-muted-foreground">{value}</span>
                  )}
                </span>
              </Row>
            </li>
          );
        })}
        <li>
          <SignOutRow
            onSignOut={props.onSignOut}
            onEverywhereSignOut={props.onEverywhereSignOut}
            {...(props.error ? { error: props.error } : {})}
          />
        </li>
      </ul>
    </nav>
  );
}

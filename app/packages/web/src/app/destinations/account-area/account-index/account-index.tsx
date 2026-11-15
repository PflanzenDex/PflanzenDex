import { useState } from "react";
import { useFeature } from "@/shared/data";
import { BUSY_LOOK } from "@/shared/lib/utils";
import { texts } from "@/shared/lib/text-rules/texts";
import { GroupedList, GroupedRow } from "@/shared/lists/grouped-list/grouped-list";
import { Banner } from "@/shared/patterns/states/banner/banner";
import { Button } from "@/shared/ui/button/button";
import { ResponsiveModal } from "@/shared/patterns/responsive/responsive-modal/responsive-modal";
import {
  accountAddress,
  type AccountSection,
} from "@/shared/patterns/navigation/navigation/navigation";
import type { Account } from "@/account";
import { SECTIONS, rowId } from "../account-model/account-model";
import table from "../account-area.de.json";
import { useAccountValues, type Values } from "./account-values";
import { InstallRow } from "./install-row/install-row";
import { EverywhereError } from "./everywhere-error/everywhere-error";

const t = texts(table);

type Section = (typeof SECTIONS)[number];

/** The sections that are on for the account; the profile has its own group above them (US-QS-17). */
function rowsOf(values: Values, ai: boolean | undefined, hasOverview: boolean): Section[] {
  return SECTIONS.filter(
    (s) =>
      s.key !== "profile" &&
      (s.key !== "achievements" || values.achievementsShown) &&
      (s.key !== "aiClients" || ai) &&
      (s.key !== "functions" || hasOverview),
  );
}

/** The rows of one group that are on, in the order of the group (US-QS-32). */
function rowsIn(rows: Section[], keys: readonly AccountSection[]): Section[] {
  return keys.flatMap((key) => rows.filter((s) => s.key === key));
}

type Token = () => Promise<string | undefined>;

/** One section as a row: its name, its current value when it is text, and the chevron of a navigation row. */
function SectionRow(props: {
  section: Section;
  values: Values;
  current: AccountSection | undefined;
}) {
  const { section } = props;
  const value = props.values[section.key];
  return (
    <GroupedRow
      id={rowId(section.key)}
      to={accountAddress(section.key)}
      current={props.current === section.key}
      title={section.title}
      {...(typeof value === "string" ? { trailing: value } : {})}
    />
  );
}

/** The confirmation of signing out (US-QS-17): a sheet on a phone, a dialog on a large screen. */
function SignOutRow(props: {
  onSignOut: () => void;
  onEverywhereSignOut: () => void;
  /** The error of the last try (US-ACC-01): the dialog stays open, so the person can press again. */
  error?: string;
  /** The error of a failed "Auf allen Geräten abmelden": its retry repeats that sign-out (US-QS-32). */
  everywhereError?: string;
  /** "Auf allen Geräten abmelden" runs: the control is busy and a press does nothing (US-ACC-01). */
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Its own group, in red and without a chevron: the one destructive step of the index (SG-COLOR-04, US-QS-32). */}
      <GroupedList>
        <GroupedRow tone="destructive" onClick={() => setOpen(true)} title="Abmelden …" />
      </GroupedList>
      <ResponsiveModal title="Abmelden?" closeLabel="Schließen" open={open} onOpenChange={setOpen}>
        <div className="flex flex-col gap-3">
          {props.error && <Banner variant="error">{props.error}</Banner>}
          {props.everywhereError && (
            <EverywhereError
              text={props.everywhereError}
              busy={props.busy}
              onRetry={props.onEverywhereSignOut}
            />
          )}
          <Button type="button" size="touch" onClick={props.onSignOut}>
            Abmelden
          </Button>
          <Button
            type="button"
            variant="outline"
            size="touch"
            aria-disabled={props.busy || undefined}
            aria-busy={props.busy || undefined}
            className={BUSY_LOOK}
            onClick={() => {
              if (!props.busy) props.onEverywhereSignOut();
            }}
          >
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

type IndexProps = {
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
  everywhereError?: string;
  /** "Auf allen Geräten abmelden" runs (US-ACC-01): busy until its answer. */
  everywhereBusy?: boolean;
};

/**
 * The index of "Konto" (US-QS-17, US-QS-32): the profile in a group of its own, then the groups "Konto", "Daten" and
 * "App" as flat grouped lists, and "Abmelden …" alone in red. Each row opens its section as a view of its own. The
 * current section is marked by `aria-current` and a semibold title, not by colour alone. Sections that are off (calm
 * mode, the keeper's switch of the achievements, function "ai", no overview) have no row; a group without a row is not
 * shown.
 */
export function AccountIndex(props: IndexProps) {
  const ai = useFeature("ai");
  const values = useAccountValues(props.api, props.token);
  const rows = rowsOf(values, ai, props.hasOverview);
  const name = props.account.displayName || props.account.email;
  const konto = rowsIn(rows, ["settings", "reminders", "achievements", "aiClients"]);
  const daten = rowsIn(rows, ["measured", "data"]);
  const app = rowsIn(rows, ["functions", "news"]);
  const shown = (section: Section) => (
    <SectionRow key={section.key} section={section} values={values} current={props.current} />
  );
  return (
    <nav aria-label="Abschnitte von Konto" className="flex min-w-0 flex-col gap-6">
      <GroupedList>
        <GroupedRow
          id={rowId("profile")}
          to={accountAddress("profile")}
          current={props.current === "profile"}
          leading={
            <span
              aria-hidden="true"
              className="flex size-9 items-center justify-center rounded-xl bg-muted text-base font-semibold text-foreground"
            >
              {name.slice(0, 1).toUpperCase()}
            </span>
          }
          title={<span className="font-semibold [overflow-wrap:anywhere]">{name}</span>}
          meta={props.account.email}
        />
      </GroupedList>
      {konto.length > 0 && (
        <GroupedList label={t("index.group.account")}>{konto.map(shown)}</GroupedList>
      )}
      {daten.length > 0 && (
        <GroupedList label={t("index.group.data")}>{daten.map(shown)}</GroupedList>
      )}
      <GroupedList label={t("index.group.app")}>
        {app.map(shown)}
        <InstallRow />
      </GroupedList>
      <SignOutRow
        onSignOut={props.onSignOut}
        onEverywhereSignOut={props.onEverywhereSignOut}
        {...(props.error ? { error: props.error } : {})}
        {...(props.everywhereError ? { everywhereError: props.everywhereError } : {})}
        busy={props.everywhereBusy ?? false}
      />
    </nav>
  );
}

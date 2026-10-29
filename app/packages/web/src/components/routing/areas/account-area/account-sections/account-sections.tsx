import { Suspense, type ReactNode } from "react";
import { Link } from "react-router";
import { RemindersSection } from "@/monitoring";
import { AiSection } from "@/ai";
import { PrivacySection } from "@/privacy";
import {
  CareRhythmSection,
  AchievementsOverviewSection,
  YearInReviewSection,
} from "@/achievements";
import { AccountView, MeasuredView, SettingsPage } from "@/account";
import type { Account } from "@/account";
import { Button } from "@/components/ui/button/button";
import {
  MANAGE_ADDRESS,
  type AccountSection,
} from "@/components/shared/navigation/nav-model/navigation/navigation";

type Token = () => Promise<string | undefined>;
/** Renders the locked rows of some functions inside a section (US-ONB-05); wired by the app. */
export type Locks = (ids: readonly string[]) => ReactNode;

function LocksHere(props: { locks: Locks | undefined; ids: readonly string[] }) {
  return props.locks ? <Suspense fallback={null}>{props.locks(props.ids)}</Suspense> : null;
}

export type SectionProps = {
  api: string;
  token: Token;
  account: Account;
  error?: string | undefined;
  onSignOut: () => void;
  onEverywhereSignOut: () => void;
  /** The overview "Was die App kann" (US-ONB-06) from the shell, which no area imports. */
  overview?: ReactNode;
  locks?: Locks | undefined;
};

/** The settings with the link to the management of the locations and light zones, which lives in the Sammlung. */
function SettingsContent(props: { api: string; token: Token }) {
  return (
    <>
      <SettingsPage api={props.api} token={props.token} host />
      <p className="text-sm text-muted-foreground">
        Standorte und Lichtzonen legst du in der Sammlung an und änderst sie dort.
      </p>
      <Button asChild variant="secondary" className="self-start">
        <Link to={MANAGE_ADDRESS}>Standorte und Lichtzonen verwalten</Link>
      </Button>
    </>
  );
}

/**
 * The content of one section of "Konto" (US-QS-17), without its heading: the view of the section names it. Every part
 * comes from its own module and is a lazy chunk (QG-U6). The section before the last says what is recorded about the
 * use (US-QS-05); the last one is the download of all own data and deleting the account (US-ACC-04).
 */
export function SectionContent({ section, ...p }: SectionProps & { section: AccountSection }) {
  switch (section) {
    case "profile":
      return (
        <AccountView
          account={p.account}
          onSignOut={p.onSignOut}
          onEverywhereSignOut={p.onEverywhereSignOut}
          {...(p.error ? { error: p.error } : {})}
        />
      );
    case "settings":
      return <SettingsContent api={p.api} token={p.token} />;
    case "achievements":
      return (
        <div className="flex min-w-0 flex-col gap-6">
          <LocksHere locks={p.locks} ids={["care_rhythm", "anniversaries", "year_in_review"]} />
          <CareRhythmSection api={p.api} token={p.token} />
          <AchievementsOverviewSection api={p.api} token={p.token} />
          <YearInReviewSection api={p.api} token={p.token} />
        </div>
      );
    case "reminders":
      return <RemindersSection api={p.api} token={p.token} />;
    case "aiClients":
      return (
        <>
          <LocksHere locks={p.locks} ids={["ai_access"]} />
          <AiSection api={p.api} token={p.token} />
        </>
      );
    case "measured":
      return <MeasuredView />;
    case "functions":
      return <>{p.overview}</>;
    case "data":
      return <PrivacySection api={p.api} token={p.token} />;
  }
}

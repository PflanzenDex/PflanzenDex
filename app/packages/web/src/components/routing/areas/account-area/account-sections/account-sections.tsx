import { Suspense, type ReactNode } from "react";
import { Link } from "react-router";
import { AreaSection } from "@/components/routing/areas/shared/area-section/area-section";
import { RemindersSection } from "@/monitoring";
import { AiSection } from "@/ai";
import { PrivacySection } from "@/privacy";
import {
  CareRhythmSection,
  AchievementsOverviewSection,
  YearInReviewSection,
} from "@/achievements";
import { MeasuredView, SettingsPage } from "@/account";
import { Button } from "@/components/ui/button/button";
import {
  ACCOUNT_SECTIONS,
  MANAGE_ADDRESS,
} from "@/components/shared/navigation/nav-model/navigation/navigation";

type Token = () => Promise<string | undefined>;
/** Renders the locked rows of some functions inside a section (US-ONB-05); wired by the app. */
export type Locks = (ids: readonly string[]) => ReactNode;

function LocksHere(props: { locks: Locks | undefined; ids: readonly string[] }) {
  return props.locks ? <Suspense fallback={null}>{props.locks(props.ids)}</Suspense> : null;
}

/** The settings with the link to the management of the locations and light zones, which lives in the Sammlung. */
export function SettingsSection(props: { api: string; token: Token }) {
  return (
    <AreaSection
      anchor={ACCOUNT_SECTIONS.settings}
      title="Einstellungen"
      loading="Einstellungen werden geladen …"
    >
      <SettingsPage api={props.api} token={props.token} host />
      <p className="text-sm text-muted-foreground">
        Standorte und Lichtzonen legst du in der Sammlung an und änderst sie dort.
      </p>
      <Button asChild variant="secondary" className="self-start">
        <Link to={MANAGE_ADDRESS}>Standorte und Lichtzonen verwalten</Link>
      </Button>
    </AreaSection>
  );
}

/** The overview of the achievements (US-ACH-02) as a section of "Konto". */
export function AchievementsSection(props: {
  api: string;
  token: Token;
  locks?: Locks | undefined;
}) {
  return (
    <AreaSection
      anchor={ACCOUNT_SECTIONS.achievements}
      title="Erfolge"
      loading="Erfolge werden geladen …"
    >
      <div className="flex min-w-0 flex-col gap-6">
        <LocksHere locks={props.locks} ids={["care_rhythm", "anniversaries", "year_in_review"]} />
        <CareRhythmSection api={props.api} token={props.token} />
        <AchievementsOverviewSection api={props.api} token={props.token} />
        <YearInReviewSection api={props.api} token={props.token} />
      </div>
    </AreaSection>
  );
}

/** Download of all own data and deleting the account (US-ACC-04). */
function DataSection(props: { api: string; token: Token }) {
  return (
    <AreaSection
      anchor={ACCOUNT_SECTIONS.data}
      title="Meine Daten"
      loading="Meine Daten werden geladen …"
    >
      <PrivacySection api={props.api} token={props.token} />
    </AreaSection>
  );
}

/** The sections from the reminders on: the AI clients only while the function is on, the overview when the shell hands it in. */
export function LowerSections(props: {
  api: string;
  token: Token;
  ai: boolean;
  overview: ReactNode;
  locks?: Locks | undefined;
}) {
  const { api, token, ai, overview } = props;
  return (
    <>
      <AreaSection
        anchor={ACCOUNT_SECTIONS.reminders}
        title="Erinnerungen"
        loading="Erinnerungen werden geladen …"
      >
        <RemindersSection api={api} token={token} />
      </AreaSection>
      {ai && (
        <AreaSection
          anchor={ACCOUNT_SECTIONS.aiClients}
          title="KI-Clients"
          loading="KI-Clients werden geladen …"
        >
          <LocksHere locks={props.locks} ids={["ai_access"]} />
          <AiSection api={api} token={token} />
        </AreaSection>
      )}
      <AreaSection
        anchor={ACCOUNT_SECTIONS.measured}
        title="Was wird gemessen?"
        loading="Wird geladen …"
      >
        <MeasuredView />
      </AreaSection>
      {overview !== undefined && (
        <AreaSection
          anchor={ACCOUNT_SECTIONS.functions}
          title="Was die App kann"
          loading="Funktionen werden geladen …"
        >
          {overview}
        </AreaSection>
      )}
      <DataSection api={api} token={token} />
    </>
  );
}

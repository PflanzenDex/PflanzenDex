import { cn } from "@/lib/utils";
import { useFeature } from "@/kernel";
import { Link, useLocation } from "react-router";
import { AreaSection } from "@/components/routing/areas/shared/area-section/area-section";
import { useSectionAnchor } from "@/components/routing/areas/shared/area-section/use-section-anchor";
import { RemindersSection } from "@/monitoring";
import { AiSection } from "@/ai";
import { PrivacySection } from "@/privacy";
import {
  AchievementsOverviewSection,
  CareRhythmSection,
  YearInReviewSection,
  useAchievementsVisible,
} from "@/achievements";
import { AccountView, MeasuredView, SettingsPage } from "@/account";
import type { Account } from "@/account";
import { Button } from "@/components/ui/button/button";
import {
  ACCOUNT_SECTIONS,
  MANAGE_ADDRESS,
  PATHS,
} from "@/components/shared/navigation/nav-model/navigation/navigation";

type Token = () => Promise<string | undefined>;

/** The sections in the order of the page: the anchor of the address, the heading and the loading text. */
const SECTIONS = [
  { anchor: ACCOUNT_SECTIONS.profile, title: "Profil" },
  { anchor: ACCOUNT_SECTIONS.settings, title: "Einstellungen" },
  { anchor: ACCOUNT_SECTIONS.achievements, title: "Erfolge" },
  { anchor: ACCOUNT_SECTIONS.reminders, title: "Erinnerungen" },
  { anchor: ACCOUNT_SECTIONS.aiClients, title: "KI-Clients" },
  { anchor: ACCOUNT_SECTIONS.measured, title: "Was wird gemessen?" },
  { anchor: ACCOUNT_SECTIONS.data, title: "Meine Daten" },
] as const;
const NAMES: Record<string, string> = Object.fromEntries(SECTIONS.map((s) => [s.anchor, s.title]));

const LINK =
  "flex min-h-11 items-center rounded-lg px-3 text-[15px] font-medium text-foreground hover:bg-muted";

/** The in-page list of the sections for wide screens: the current one (anchor, "Profil" without) is marked by colour and `aria-current`. */
function SectionNav({ sections }: { sections: readonly (typeof SECTIONS)[number][] }) {
  const { hash } = useLocation();
  const current = NAMES[hash.slice(1)] ? hash.slice(1) : ACCOUNT_SECTIONS.profile;
  return (
    <nav aria-label="Abschnitte von Konto" className="hidden xl:block">
      <ul className="sticky top-6 m-0 flex w-[200px] list-none flex-col gap-1 p-0">
        {sections.map((s) => (
          <li key={s.anchor}>
            <Link
              to={{ pathname: PATHS.account, hash: s.anchor }}
              state={{ keepFocus: true }}
              aria-current={s.anchor === current ? "location" : undefined}
              className={cn(
                LINK,
                s.anchor === current && "bg-accent text-accent-foreground hover:bg-accent",
              )}
            >
              {s.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The settings with the link to the management of the locations and light zones, which lives in the Sammlung. */
function SettingsSection(props: { api: string; token: Token }) {
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
function AchievementsSection(props: { api: string; token: Token }) {
  return (
    <AreaSection
      anchor={ACCOUNT_SECTIONS.achievements}
      title="Erfolge"
      loading="Erfolge werden geladen …"
    >
      <div className="flex min-w-0 flex-col gap-6">
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

/** Calm mode hides the entry and the section of the achievements altogether (US-ACH-08). */
function useVisibleSections(api: string, token: Token) {
  const achievements = useAchievementsVisible(api, token);
  const ai = useFeature("ai");
  const sections = SECTIONS.filter(
    (s) =>
      (achievements || s.anchor !== ACCOUNT_SECTIONS.achievements) &&
      (ai || s.anchor !== ACCOUNT_SECTIONS.aiClients),
  );
  return { sections, achievements, ai };
}

/**
 * The destination "Konto" (US-QS-14): the profile with the ways to sign out (US-ACC-01) and the settings (US-ACC-02)
 * as sections one below the other, with a list of the sections beside them on wide screens. The app wires the modules;
 * the settings are their own lazy part. The old address of "Einstellungen" leads to the anchor of its section.
 * The settings end with a link to the management of the locations and light zones, which lives in the Sammlung.
 * Invitations to friends belong to "Freunde" (US-SOZ), not to the account, so there is no section for them. The section before the last says what is recorded about the use (US-QS-05); the last one is the download of all own data and deleting the account (US-ACC-04).
 */
export function AccountArea(props: {
  api: string;
  token: Token;
  account: Account;
  error?: string;
  onSignOut: () => void;
  onEverywhereSignOut: () => void;
}) {
  useSectionAnchor(NAMES);
  const { sections, achievements, ai } = useVisibleSections(props.api, props.token);
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <h1 className="text-2xl font-semibold">Konto</h1>
      <div className="flex min-w-0 gap-8">
        <SectionNav sections={sections} />
        <div className="flex min-w-0 flex-1 flex-col gap-8">
          <AreaSection
            anchor={ACCOUNT_SECTIONS.profile}
            title="Profil"
            loading="Profil wird geladen …"
          >
            <AccountView
              account={props.account}
              onSignOut={props.onSignOut}
              onEverywhereSignOut={props.onEverywhereSignOut}
              {...(props.error ? { error: props.error } : {})}
            />
          </AreaSection>
          <SettingsSection api={props.api} token={props.token} />
          {achievements && <AchievementsSection api={props.api} token={props.token} />}
          <AreaSection
            anchor={ACCOUNT_SECTIONS.reminders}
            title="Erinnerungen"
            loading="Erinnerungen werden geladen …"
          >
            <RemindersSection api={props.api} token={props.token} />
          </AreaSection>
          {ai && (
            <AreaSection
              anchor={ACCOUNT_SECTIONS.aiClients}
              title="KI-Clients"
              loading="KI-Clients werden geladen …"
            >
              <AiSection api={props.api} token={props.token} />
            </AreaSection>
          )}
          <AreaSection
            anchor={ACCOUNT_SECTIONS.measured}
            title="Was wird gemessen?"
            loading="Wird geladen …"
          >
            <MeasuredView />
          </AreaSection>
          <DataSection api={props.api} token={props.token} />
        </div>
      </div>
    </div>
  );
}

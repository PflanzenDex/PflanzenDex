import { cn } from "@/lib/utils";
import { Link, useLocation } from "react-router";
import { AreaSection } from "@/components/routing/areas/shared/area-section/area-section";
import { useSectionAnchor } from "@/components/routing/areas/shared/area-section/use-section-anchor";
import { AccountView, SettingsPage } from "@/account";
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
] as const;
const NAMES: Record<string, string> = Object.fromEntries(SECTIONS.map((s) => [s.anchor, s.title]));

const LINK =
  "flex min-h-11 items-center rounded-lg px-3 text-[15px] font-medium text-foreground hover:bg-muted";

/** The in-page list of the sections for wide screens: the current one (anchor, "Profil" without) is marked by colour and `aria-current`. */
function SectionNav() {
  const { hash } = useLocation();
  const current = NAMES[hash.slice(1)] ? hash.slice(1) : ACCOUNT_SECTIONS.profile;
  return (
    <nav aria-label="Abschnitte von Konto" className="hidden xl:block">
      <ul className="sticky top-6 m-0 flex w-[200px] list-none flex-col gap-1 p-0">
        {SECTIONS.map((s) => (
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

/**
 * The destination "Konto" (US-QS-14): the profile with the ways to sign out (US-ACC-01) and the settings (US-ACC-02)
 * as sections one below the other, with a list of the sections beside them on wide screens. The app wires the modules;
 * the settings are their own lazy part. The old address of "Einstellungen" leads to the anchor of its section.
 * The settings end with a link to the management of the locations and light zones, which lives in the Sammlung.
 * Invitations to friends belong to "Freunde" (US-SOZ), not to the account, so there is no section for them.
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
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <h1 className="text-2xl font-semibold">Konto</h1>
      <div className="flex min-w-0 gap-8">
        <SectionNav />
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
        </div>
      </div>
    </div>
  );
}

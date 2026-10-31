import { LayerHost } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { useEffect, useRef, type ReactNode } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router";
import { useFeature } from "@/kernel";
import { useIsLg } from "@/lib/use-breakpoint";
import { useAnnounce } from "@/platform/announcer/context";
import { AreaSection } from "@/components/routing/areas/shared/area-section/area-section";
import { PageHeader } from "@/components/shared/navigation/app-shell/page-header/page-header";
import { headingId } from "@/components/routing/areas/shared/area-section/use-section-anchor";
import { SETTINGS_LAYER_IDS, type Account } from "@/account";
import {
  PATHS,
  type AccountSection,
} from "@/components/shared/navigation/nav-model/navigation/navigation";
import { AccountIndex } from "./account-index/account-index";
import {
  ACCOUNT_SECTIONS,
  LEGACY_ACCOUNT_ANCHORS,
  SECTIONS,
  rowId,
  sectionOf,
} from "./account-model/account-model";
import { SectionContent, type Locks } from "./account-sections/account-sections";

type Token = () => Promise<string | undefined>;

type Props = {
  api: string;
  token: Token;
  account: Account;
  error?: string;
  onSignOut: () => void;
  onEverywhereSignOut: () => void;
  /** The overview "Was die App kann" (US-ONB-06) from the shell, which no area imports; without it the section is missing. */
  overview?: ReactNode;
  /** The locked rows inside the sections (US-ONB-05): AI access and the achievements; the app wires it. */
  locks?: Locks;
};

/**
 * One section as a view of its own (US-QS-17): its name is the main heading and gets the focus, "Konto" leads back.
 * `byDefault` is Einstellungen opened by itself beside the index on a wide screen: nobody chose it, so it takes no
 * focus, is not announced and has no way back (the index is beside it).
 */
function SectionView(props: Props & { section: AccountSection; byDefault?: boolean }) {
  const { byDefault = false, ...rest } = props;
  const info = SECTIONS.find((s) => s.key === rest.section);
  const announcer = useAnnounce();
  const { key } = useLocation();
  const id = headingId(ACCOUNT_SECTIONS[rest.section]);
  useEffect(() => {
    if (byDefault) return;
    const heading = document.getElementById(id);
    heading?.setAttribute("tabindex", "-1");
    heading?.focus();
    if (info) announcer?.announce(info.title);
  }, [id, key, info, announcer, byDefault]);
  if (!info) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <AreaSection
        anchor={ACCOUNT_SECTIONS[rest.section]}
        title={info.title}
        loading={info.loading}
        heading={
          // The section's name is the one h1; the way back "Zurück zu Konto" is the page header's (issue 1031). From
          // 1280 px the index stands beside the section, so the way back is hidden there.
          <PageHeader
            headingId={id}
            title={info.title}
            {...(byDefault
              ? {}
              : {
                  back: {
                    label: "Zurück zu Konto",
                    to: PATHS.account,
                    state: { keepFocus: true },
                    className: "xl:hidden",
                  },
                })}
          />
        }
      >
        <SectionContent {...rest} />
      </AreaSection>
    </div>
  );
}

/**
 * The column of the index: beside an open section it shows from 1280 px, and it yields then while a layer of the section
 * is open, so the section keeps the room a layer needs beside its list (US-QS-15). Beside the section that opens by
 * itself (`byDefault`, from 1024 px) it stays, because it is the way to the other sections (US-QS-17).
 */
function indexClass(
  open: AccountSection | undefined,
  layered: boolean,
  byDefault: boolean,
): string {
  if (open === undefined) return "min-w-0 flex-1 xl:w-[300px] xl:flex-none";
  if (layered) return "hidden w-[300px] flex-none";
  if (byDefault) return "w-[300px] flex-none";
  return "hidden w-[300px] flex-none xl:block";
}

/** Back to the index puts the focus on the row the keeper came from (US-QS-17). */
function useReturnFocus(chosen: AccountSection | undefined) {
  const came = useRef<AccountSection | null>(null);
  useEffect(() => {
    if (chosen) {
      came.current = chosen;
      return;
    }
    if (came.current) document.getElementById(rowId(came.current))?.focus();
    came.current = null;
  }, [chosen]);
}

/** The page title: "Konto" is the h1 of the index; beside a section it is a paragraph, shown from 1280 px or 1024 px. */
function KontoTitle(props: { open: AccountSection | undefined; byDefault: boolean }) {
  if (props.open === undefined) return <h1 className="text-2xl font-semibold">Konto</h1>;
  return (
    <p
      className={
        props.byDefault
          ? "m-0 hidden text-2xl font-semibold lg:block"
          : "m-0 hidden text-2xl font-semibold xl:block"
      }
    >
      Konto
    </p>
  );
}

/** A section that is off leads to the index: AI access without the AI function, "Was die App kann" without its overview. */
function isOff(open: AccountSection | undefined, ai: boolean | undefined, hasOverview: boolean) {
  return (open === "aiClients" && !ai) || (open === "functions" && !hasOverview);
}

/**
 * The destination "Konto" (US-QS-17): an index of its sections like the settings app of a phone. `/account` shows the
 * index, `/account/<section>` the section as a view of its own with one main heading; on a wide screen (1280 px) the
 * index stands beside the open section. Back to the index puts the focus on the row the keeper came from. Former
 * anchors (`/account#erfolge`) lead to the matching section; unknown segments and sections that are off lead to the
 * index. The old address of "Einstellungen" leads to its section (US-QS-14). Invitations to friends belong to
 * "Freunde" (US-SOZ), not to the account, so there is no section for them.
 */
export function AccountArea(props: Props) {
  const { pathname, hash } = useLocation();
  const section = sectionOf(pathname);
  const ai = useFeature("ai");
  const sheet = useSearchParams()[0].get("sheet");
  const isLg = useIsLg();
  // The section the keeper chose. From 1024 px an address without one shows Einstellungen in the pane beside the index,
  // so no pane stays empty (US-QS-17, #1027); below 1024 px the index is the page.
  const chosen = section === "unknown" ? undefined : section;
  const byDefault = chosen === undefined && isLg;
  const open = chosen ?? (byDefault ? "settings" : undefined);
  // A settings layer beside its list needs the room of the index: on a wide screen the index yields while one is open
  // (US-QS-15). Only a real settings layer counts; any other `?sheet` leaves the index where it is.
  const layered = open === "settings" && sheet !== null && SETTINGS_LAYER_IDS.includes(sheet);
  useReturnFocus(chosen);

  const legacy = LEGACY_ACCOUNT_ANCHORS[hash.slice(1)];
  if (section === undefined && legacy)
    return <Navigate to={`${PATHS.account}/${ACCOUNT_SECTIONS[legacy]}`} replace />;
  if (section === "unknown" || isOff(open, ai, props.overview !== undefined))
    return <Navigate to={PATHS.account} replace />;

  // The section's frame widens from 1024 px: a settings layer inside it needs the room beside its list (US-QS-15, #1027).
  return (
    <div className="flex min-w-0 flex-col gap-3 lg:gap-6">
      <KontoTitle open={open} byDefault={byDefault} />
      <div className="flex min-w-0 gap-8">
        <div className={indexClass(open, layered, byDefault)}>
          <AccountIndex
            api={props.api}
            token={props.token}
            account={props.account}
            current={open}
            hasOverview={props.overview !== undefined}
            onSignOut={props.onSignOut}
            onEverywhereSignOut={props.onEverywhereSignOut}
          />
        </div>
        {open !== undefined ? (
          <LayerHost className="min-w-0 flex-1" contentClassName="lg:max-w-none">
            <SectionView {...props} section={open} byDefault={byDefault} />
          </LayerHost>
        ) : null}
      </div>
    </div>
  );
}

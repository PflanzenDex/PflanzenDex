import { useEffect, useRef, type ReactNode } from "react";
import { Link, Navigate, useLocation, useSearchParams } from "react-router";
import { useFeature } from "@/kernel";
import { useAnnounce } from "@/platform/announcer/context";
import { AreaSection } from "@/components/routing/areas/shared/area-section/area-section";
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

/** One section as a view of its own (US-QS-17): its name is the main heading and gets the focus, "Konto" leads back. */
function SectionView(props: Props & { section: AccountSection }) {
  const info = SECTIONS.find((s) => s.key === props.section);
  const announcer = useAnnounce();
  const { key } = useLocation();
  const id = headingId(ACCOUNT_SECTIONS[props.section]);
  useEffect(() => {
    const heading = document.getElementById(id);
    heading?.setAttribute("tabindex", "-1");
    heading?.focus();
    if (info) announcer?.announce(info.title);
  }, [id, key, info, announcer]);
  if (!info) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Link
        to={PATHS.account}
        state={{ keepFocus: true }}
        className="inline-flex min-h-11 items-center self-start rounded-lg px-1 text-[15px] font-medium underline xl:hidden"
      >
        Konto
      </Link>
      <AreaSection
        anchor={ACCOUNT_SECTIONS[props.section]}
        title={info.title}
        loading={info.loading}
        heading={
          <h1 id={id} className="text-2xl font-semibold">
            {info.title}
          </h1>
        }
      >
        <SectionContent {...props} />
      </AreaSection>
    </div>
  );
}

/**
 * The column of the index: beside an open section it shows from 1280 px, and it yields then while a layer of the section
 * is open, so the section keeps the room a layer needs beside its list (US-QS-15).
 */
function indexClass(open: AccountSection | undefined, layered: boolean): string {
  if (open === undefined) return "min-w-0 flex-1 xl:w-[300px] xl:flex-none";
  return layered ? "hidden w-[300px] flex-none" : "hidden w-[300px] flex-none xl:block";
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
  const came = useRef<AccountSection | null>(null);
  const open = section === "unknown" ? undefined : section;
  // A settings layer beside its list needs the room of the index: on a wide screen the index yields while one is open
  // (US-QS-15). Only a real settings layer counts; any other `?sheet` leaves the index where it is.
  const layered = open === "settings" && sheet !== null && SETTINGS_LAYER_IDS.includes(sheet);
  useEffect(() => {
    if (open) {
      came.current = open;
      return;
    }
    if (came.current) document.getElementById(rowId(came.current))?.focus();
    came.current = null;
  }, [open]);

  const legacy = LEGACY_ACCOUNT_ANCHORS[hash.slice(1)];
  if (section === undefined && legacy)
    return <Navigate to={`${PATHS.account}/${ACCOUNT_SECTIONS[legacy]}`} replace />;
  const off =
    (open === "aiClients" && !ai) || (open === "functions" && props.overview === undefined);
  if (section === "unknown" || off) return <Navigate to={PATHS.account} replace />;

  return (
    <div className="flex min-w-0 flex-col gap-3 lg:gap-6">
      {open === undefined ? (
        <h1 className="text-2xl font-semibold">Konto</h1>
      ) : (
        <p className="m-0 hidden text-2xl font-semibold xl:block">Konto</p>
      )}
      <div className="flex min-w-0 gap-8">
        <div className={indexClass(open, layered)}>
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
          <div className="min-w-0 flex-1">
            <SectionView {...props} section={open} />
          </div>
        ) : (
          <p className="m-0 hidden min-w-0 flex-1 text-muted-foreground xl:block">
            Wähle links einen Abschnitt.
          </p>
        )}
      </div>
    </div>
  );
}

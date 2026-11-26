import { Fragment, useCallback, type ReactNode } from "react";
import { LayerHost, LayerSheet } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { PageHeader } from "@/shared/patterns/navigation/page-header/page-header";
import { CalmModeSection, loadAchievementSettings } from "../../achievements";
import { useRequest } from "../../shared/data";
import { LoadFrame } from "@/shared/patterns/states/request-state/load-frame/load-frame";
import { loadProfile, type AccountProfile } from "../api/account-api";
import { LightGroup, ProfileGroup, WishlistGroup } from "./groups/form-groups/form-groups";
import { SETTINGS_LAYER } from "../index";
import {
  UNKNOWN,
  lightValue,
  notificationsValue,
  privacyValue,
  profileValue,
  styleValue,
  wishlistValue,
} from "./groups/group-values";
import { useProfileSaver } from "./groups/profile-saver";
import {
  NOT_LOADED,
  RetryFailedLoad,
} from "@/shared/patterns/states/request-state/failed-value/failed-value";
import { SettingsRow } from "./groups/settings-row/settings-row";
import {
  NotificationsGroup,
  PrivacyGroup,
  ShortcutsGroup,
  MotionGroup,
} from "./groups/switch-groups/switch-groups";
import { KeeperStyleSection } from "./keeper-style/keeper-style";
import { loadKeeperStyle } from "./keeper-style/keeper-style-api";
import { DelayedSkeleton, useHeldLoader } from "@/shared/ui/skeleton.delayed";
import { SettingsPageSkeleton } from "./settings-page.skeleton";

type Token = () => Promise<string | undefined>;

/** The value of the row while it loads; it shows after the delay (DS-57, issue 1726). */
const STYLE_LOADING = "wird geladen …";

/**
 * The row "Wie nutzt du die App?": loaded on its own, so a failure shows here and nowhere else (P-10). A failed load reads
 * "Nicht geladen" and returns its retry, which the list shows beside the row (a row is a button and holds no control, US-QS-32).
 */
function useStyleRow(api: string, token: Token): { value: ReactNode; retry?: () => void } {
  const style = useRequest({
    queryKey: ["onboarding", "style"],
    fresh: true,
    token,
    load: useCallback((t: string) => loadKeeperStyle(api, t), [api]),
  });
  const calm = useRequest({
    queryKey: ["achievements", "settings"],
    fresh: true,
    token,
    load: useCallback((t: string) => loadAchievementSettings(api, t), [api]),
  });
  const loading = useHeldLoader(style.status === "pending");
  if (loading) return { value: <DelayedSkeleton>{STYLE_LOADING}</DelayedSkeleton> };
  if (style.status === "error") return { value: NOT_LOADED, retry: style.retry };
  if (style.value === undefined) return { value: UNKNOWN };
  return { value: styleValue(style.value.style, calm.value?.calmMode) };
}

function Groups(props: { api: string; token: Token; profile: AccountProfile }) {
  const saver = useProfileSaver(props.api, props.token, props.profile);
  const style = useStyleRow(props.api, props.token);
  const p = saver.saved;
  const ids = SETTINGS_LAYER;
  const layers: readonly SettingsLayer[] = [
    {
      id: ids.profile,
      title: "Profil",
      value: profileValue(p),
      body: <ProfileGroup saver={saver} />,
    },
    {
      id: ids.notifications,
      title: "Benachrichtigungen",
      value: notificationsValue,
      body: <NotificationsGroup saver={saver} />,
    },
    {
      id: ids.privacy,
      title: "Datenschutz und Empfehlungen",
      value: privacyValue(p),
      body: <PrivacyGroup saver={saver} />,
    },
    {
      id: ids.style,
      title: "Wie nutzt du die App?",
      value: style.value,
      ...(style.retry ? { retry: style.retry } : {}),
      body: (
        <div className="flex flex-col gap-3">
          <KeeperStyleSection api={props.api} token={props.token} />
          <CalmModeSection api={props.api} token={props.token} />
          <ShortcutsGroup saver={saver} />
          <MotionGroup saver={saver} />
        </div>
      ),
    },
    {
      id: ids.wishlist,
      title: "Wunschliste",
      value: wishlistValue(p),
      body: <WishlistGroup saver={saver} />,
    },
    { id: ids.light, title: "Licht", value: lightValue(p), body: <LightGroup saver={saver} /> },
  ];
  return <SettingsLayers layers={layers} />;
}

/** One group of the list: its row, its layer, and the retry of a failed load beside the row (US-QS-32). */
type SettingsLayer = {
  id: string;
  title: string;
  value: ReactNode;
  retry?: () => void;
  body: ReactNode;
};

/** The rows of the groups and, beside them, one layer per group (US-QS-17): the layer opens from its row. */
function SettingsLayers(props: { layers: readonly SettingsLayer[] }) {
  return (
    <>
      <div className="flex min-w-0 max-w-xl flex-1 flex-col">
        {props.layers.map((l) => (
          <Fragment key={l.id}>
            <SettingsRow id={l.id} title={l.title} value={l.value} />
            {l.retry ? (
              <div className="px-3 pb-2">
                <RetryFailedLoad name={l.title} onRetry={l.retry} />
              </div>
            ) : null}
          </Fragment>
        ))}
      </div>
      {props.layers.map((l) => (
        <LayerSheet key={l.id} id={l.id} title={l.title}>
          {l.body}
        </LayerSheet>
      ))}
    </>
  );
}

/**
 * Profile and settings (US-ACC-02) as a list of six groups with their current values (US-QS-17): each opens as a
 * layer (`?sheet=<group>`). Switches save at once; Profil, Wunschliste and Licht have their own "Sichern". With
 * `host` (a section of "Konto", US-QS-14) the page has no title of its own and sits in a card: the destination names
 * the section.
 */
export function SettingsPage(props: { api: string; token: Token; host?: boolean }) {
  const load = useCallback((t: string) => loadProfile(props.api, t), [props.api]);
  const loading = "Einstellungen werden geladen …";
  return (
    // The layers beside the card, not inside it (US-QS-15): the frame is outside the card.
    <LayerHost>
      <div
        className={
          props.host === true
            ? "flex min-w-0 flex-col gap-2 rounded-card bg-card p-2 shadow-elevation-1 lg:flex-row lg:items-start"
            : "flex min-w-0 flex-col gap-4"
        }
      >
        {props.host !== true && <PageHeader title="Einstellungen" />}
        <LoadFrame
          queryKey={["account", "profile"]}
          fresh
          token={props.token}
          load={load}
          loadingText={loading}
          loadingFallback={<SettingsPageSkeleton label={loading} />}
        >
          {(profile) => <Groups api={props.api} token={props.token} profile={profile} />}
        </LoadFrame>
      </div>
    </LayerHost>
  );
}

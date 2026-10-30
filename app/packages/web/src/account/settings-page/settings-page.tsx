import { useCallback, type ReactNode } from "react";
import { LayerSheet } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { CalmModeSection, loadAchievementSettings } from "../../achievements";
import { LoadFrame, useFeature, useRequest } from "../../kernel";
import { loadProfile, type AccountProfile } from "../api/account-api";
import { LightGroup, ProfileGroup, WishlistGroup } from "./groups/form-groups/form-groups";
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
import { SettingsRow } from "./groups/settings-row/settings-row";
import { NotificationsGroup, PrivacyGroup } from "./groups/switch-groups/switch-groups";
import { KeeperStyleSection } from "./keeper-style/keeper-style";
import { loadKeeperStyle } from "./keeper-style/keeper-style-api";
import { SettingsPageSkeleton } from "./settings-page.skeleton";

type Token = () => Promise<string | undefined>;

/** The value of the row "Wie nutzt du die App?": loaded on its own, so a failure shows here and nowhere else (P-10). */
function useStyleValue(api: string, token: Token): string {
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
  if (style.status === "pending") return "wird geladen …";
  if (style.value === undefined) return UNKNOWN;
  return styleValue(style.value.style, calm.value?.calmMode);
}

function Groups(props: { api: string; token: Token; profile: AccountProfile }) {
  const saver = useProfileSaver(props.api, props.token, props.profile);
  const social = useFeature("social");
  const styleText = useStyleValue(props.api, props.token);
  const p = saver.saved;
  const layers: readonly { id: string; title: string; value: string; body: ReactNode }[] = [
    {
      id: "profile",
      title: "Profil",
      value: profileValue(p),
      body: <ProfileGroup saver={saver} />,
    },
    {
      id: "notifications",
      title: "Benachrichtigungen",
      value: notificationsValue(p, social),
      body: <NotificationsGroup saver={saver} />,
    },
    {
      id: "privacy",
      title: "Datenschutz und Empfehlungen",
      value: privacyValue(p),
      body: <PrivacyGroup saver={saver} />,
    },
    {
      id: "style",
      title: "Wie nutzt du die App?",
      value: styleText,
      body: (
        <div className="flex flex-col gap-4">
          <KeeperStyleSection api={props.api} token={props.token} />
          <CalmModeSection api={props.api} token={props.token} />
        </div>
      ),
    },
    {
      id: "wishlist",
      title: "Wunschliste",
      value: wishlistValue(p),
      body: <WishlistGroup saver={saver} />,
    },
    { id: "light", title: "Licht", value: lightValue(p), body: <LightGroup saver={saver} /> },
  ];
  return (
    <>
      <div className="flex min-w-0 max-w-xl flex-1 flex-col">
        {layers.map((l) => (
          <SettingsRow key={l.id} id={l.id} title={l.title} value={l.value} />
        ))}
      </div>
      {layers.map((l) => (
        <LayerSheet key={l.id} id={l.id} title={l.title}>
          {l.body}
        </LayerSheet>
      ))}
    </>
  );
}

/**
 * Profile and settings (US-ACC-02) as a list of six groups with their current values (US-QS-17): each opens as a
 * layer (`?sheet=<group>`). Switches save at once; Profil, Wunschliste and Licht have their own "Speichern". With
 * `host` (a section of "Konto", US-QS-14) the page has no title of its own and sits in a card: the destination names
 * the section.
 */
export function SettingsPage(props: { api: string; token: Token; host?: boolean }) {
  const load = useCallback((t: string) => loadProfile(props.api, t), [props.api]);
  const loading = "Einstellungen werden geladen …";
  return (
    <div
      className={
        props.host === true
          ? "flex min-w-0 flex-col gap-2 rounded-card bg-card p-2 shadow-elevation-1 lg:flex-row lg:items-start"
          : "flex min-w-0 flex-col gap-4"
      }
    >
      {props.host !== true && <h1 className="text-2xl font-semibold">Einstellungen</h1>}
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
  );
}

import { useCallback, useRef, useState } from "react";
import { SwitchRow } from "@/shared/lists/switch-row/switch-row";
import { Skeleton, SkeletonGroup } from "@/shared/ui/skeleton";
import { refusalText } from "@/shared/lib/error-text";
import { texts } from "@/shared/lib/text-rules/texts";
import { useAnnounce } from "@/shared/platform/announcer/context";
import { accountKey, SIGN_IN, useInvalidate, type ApiError, useRepeatKey } from "../../shared/data";
import { LoadFrame } from "@/shared/patterns/states/request-state/load-frame/load-frame";
import {
  loadAchievementSettings,
  setCalmMode,
  type AchievementSettings,
} from "../achievements-api";
import table from "./calm-mode.de.json";

const t = texts(table);

type Token = () => Promise<string | undefined>;

/**
 * One tap saves the switch (US-QS-32, SG-CTRL-02). The switch is the result (SG-FEED-01) and the announcer says it once
 * (SG-FEED-04); a refusal stays at the row and the switch keeps its stored state (P-10).
 */
function CalmModeSwitch(props: { api: string; token: Token; settings: AchievementSettings }) {
  const [calm, setCalm] = useState(props.settings.calmMode);
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const keys = useRepeatKey();
  const refresh = useInvalidate(["achievements"]);
  const announce = useAnnounce();

  const change = async (next: boolean) => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    const tok = await props.token();
    const r = tok
      ? await keys.run(
          (key) => setCalmMode(props.api, tok, next, { key }),
          accountKey(`calm:${next}`),
        )
      : { ok: false as const, error: SIGN_IN };
    busy.current = false;
    setSaving(false);
    setError(r.ok ? null : r.error);
    if (!r.ok) return;
    setCalm(r.value.calmMode);
    refresh();
    announce?.announce(t(r.value.calmMode ? "on" : "off"));
  };

  return (
    <SwitchRow
      bare
      compact
      name="calmMode"
      label={t("label")}
      help={t("help")}
      checked={calm}
      busy={saving}
      error={error ? refusalText(error) : undefined}
      needsNetwork
      onCheckedChange={(on) => void change(on)}
    />
  );
}

/**
 * Calm mode (US-ACH-08), a switch row on the settings page (US-ACC-02, US-QS-32): hides every game element of epic ACH.
 * Off by default. It saves on its own.
 */
export function CalmModeSection(props: { api: string; token: Token }) {
  const load = useCallback((tok: string) => loadAchievementSettings(props.api, tok), [props.api]);
  const loading = t("loading");
  return (
    <LoadFrame
      queryKey={["achievements", "settings"]}
      fresh
      token={props.token}
      load={load}
      loadingText={loading}
      loadingFallback={
        <SkeletonGroup label={loading} className="flex min-w-0 max-w-xl flex-col gap-2 px-4 py-3">
          <Skeleton className="h-6 w-full" />
        </SkeletonGroup>
      }
    >
      {(settings) => <CalmModeSwitch api={props.api} token={props.token} settings={settings} />}
    </LoadFrame>
  );
}

import { useCallback, useRef, useState } from "react";
import { MoreHelp } from "@/components/ui/display/more-help/more-help";
import { Checkbox } from "@/components/ui/fields/checkbox/checkbox";
import { Skeleton, SkeletonGroup } from "@/components/ui/display/skeleton/skeleton";
import { errorText } from "@/lib/error-text";
import { LoadFrame, SIGN_IN, useInvalidate, type ApiError } from "../../kernel";
import {
  loadAchievementSettings,
  setCalmMode,
  type AchievementSettings,
} from "../achievements-api";

type Token = () => Promise<string | undefined>;

const ALERT =
  "rounded-lg border border-destructive p-3 text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** One tap saves the switch; a refusal stays visible and the switch keeps its stored state (P-10). */
function CalmModeSwitch(props: { api: string; token: Token; settings: AchievementSettings }) {
  const [calm, setCalm] = useState(props.settings.calmMode);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const busy = useRef(false);
  const refresh = useInvalidate(["achievements"]);

  const change = async (next: boolean) => {
    if (busy.current) return;
    busy.current = true;
    const t = await props.token();
    const r = t ? await setCalmMode(props.api, t, next) : { ok: false as const, error: SIGN_IN };
    busy.current = false;
    setError(r.ok ? null : r.error);
    if (!r.ok) return setMessage(null);
    setCalm(r.value.calmMode);
    refresh();
    setMessage(r.value.calmMode ? "Ruhemodus ist an." : "Ruhemodus ist aus.");
  };

  return (
    <fieldset className="m-0 flex min-w-0 flex-col rounded-lg border-2 border-border px-3 pb-2 pt-1">
      <legend className="px-1 font-semibold">Erfolge und Belohnungen</legend>
      <Checkbox name="calmMode" checked={calm} onChange={(e) => void change(e.target.checked)}>
        Ruhemodus
      </Checkbox>
      <MoreHelp
        className="mt-1"
        more={
          calm
            ? "Erfolge, Glückwünsche und Rückblicke sind ausgeblendet. Deine Erfolge bleiben erhalten; schalte den Ruhemodus aus, um sie wieder zu sehen."
            : "Der Ruhemodus blendet alle Erfolge, Glückwünsche und Rückblicke aus. Rang und Meilensteine im Pokédex bleiben unverändert."
        }
      >
        {calm ? "Erfolge und Rückblicke sind ausgeblendet." : "Blendet Erfolge und Rückblicke aus."}
      </MoreHelp>
      {error && (
        <p role="alert" className={`${ALERT} mt-2`}>
          {error.code === "network.not_reachable" ? error.text : errorText(error.code)}
        </p>
      )}
      {message && (
        <p role="status" className="mt-2 rounded-lg border border-border p-3">
          {message}
        </p>
      )}
    </fieldset>
  );
}

/**
 * Calm mode (US-ACH-08), reachable from the profile (US-ACC-02): hides every game element of epic ACH. Off by default.
 * The switch saves on its own, the confirmation says what changed (P-09).
 */
export function CalmModeSection(props: { api: string; token: Token }) {
  const load = useCallback((t: string) => loadAchievementSettings(props.api, t), [props.api]);
  const loading = "Ruhemodus wird geladen …";
  return (
    <LoadFrame
      queryKey={["achievements", "settings"]}
      fresh
      token={props.token}
      load={load}
      loadingText={loading}
      loadingFallback={
        <SkeletonGroup label={loading} className="flex min-w-0 max-w-xl flex-col gap-2">
          <Skeleton className="h-24 w-full" />
        </SkeletonGroup>
      }
    >
      {(settings) => <CalmModeSwitch api={props.api} token={props.token} settings={settings} />}
    </LoadFrame>
  );
}

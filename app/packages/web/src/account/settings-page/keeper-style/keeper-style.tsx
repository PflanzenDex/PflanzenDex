import { useCallback, useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";
import { FieldLegend, FieldSet } from "@/shared/ui/field.set";
import { MoreHelp } from "@/shared/ui/more-help";
import { Skeleton, SkeletonGroup } from "@/shared/ui/skeleton";
import { texts } from "@/shared/lib/text-rules/texts";
import { useInvalidate } from "../../../shared/data";
import { LoadFrame } from "@/shared/patterns/states/request-state/load-frame/load-frame";
import { loadKeeperStyle, type KeeperStyleState } from "./keeper-style-api";
import {
  KEEPER_STYLE_CHOICES,
  Refusal,
  StyleButtons,
  StyleSelect,
  useSaveStyle,
} from "./style-parts/style-parts";
import table from "./keeper-style.de.json";

const ui = texts(table);

type Token = () => Promise<string | undefined>;

const styleMessage = (style: string) =>
  style === "many" ? "Alles ist jetzt offen." : "Neue Funktionen zeigt dir die App nach und nach.";

function StyleFieldset(props: { api: string; token: Token; state: KeeperStyleState }) {
  const [style, setStyle] = useState(props.state.style);
  const [message, setMessage] = useState<string | null>(null);
  const refresh = useInvalidate(["onboarding"]);
  const { save, saving, error } = useSaveStyle(props, (s) => {
    setStyle(s.style);
    setMessage(styleMessage(s.style));
    refresh();
  });
  return (
    <FieldSet className="gap-0 rounded-lg border-2 border-border px-3 pb-2 pt-1">
      <FieldLegend srOnly>Wie nutzt du die App?</FieldLegend>
      <StyleSelect value={style} busy={saving} onPick={(s) => void save(s)} />
      {/* One line of hint (SG-COPY-05, US-QS-32); what the chosen style means and what stays open sit behind it. */}
      <MoreHelp
        more={
          <>
            <p className="m-0">{KEEPER_STYLE_CHOICES.find((c) => c.style === style)?.hint}</p>
            <p className="m-0">{ui("kept")}</p>
          </>
        }
      >
        Du kannst das jederzeit ändern.
      </MoreHelp>
      <Refusal error={error} />
      {message && (
        <p role="status" className="mt-2 rounded-lg border border-border p-3">
          {message}
        </p>
      )}
    </FieldSet>
  );
}

/** "Wie nutzt du die App?" in the profile (US-ONB-03, US-ACC-02): the style can change at any time and takes effect at once. */
export function KeeperStyleSection(props: { api: string; token: Token }) {
  const load = useCallback((t: string) => loadKeeperStyle(props.api, t), [props.api]);
  const loading = "Einstellung wird geladen …";
  return (
    <LoadFrame
      queryKey={["onboarding", "style"]}
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
      {(state) => <StyleFieldset api={props.api} token={props.token} state={state} />}
    </LoadFrame>
  );
}

function Question(props: { api: string; token: Token; onDone: (s: KeeperStyleState) => void }) {
  const { save, saving, error } = useSaveStyle(props, props.onDone);
  return (
    <section aria-label="Wie nutzt du die App?" className="flex flex-col gap-2">
      <h3 className="m-0 text-base font-semibold">Wie nutzt du die App?</h3>
      <StyleButtons disabled={saving} onPick={(s) => void save(s)} />
      <Refusal error={error} />
      <div>
        <Button
          type="button"
          variant="secondary"
          disabled={saving}
          onClick={() => void save("few")}
        >
          Später
        </Button>
      </div>
    </section>
  );
}

/**
 * The one question after the first plant is saved (US-ONB-03): shown only while the account has not answered. Both
 * answers and "Später" (which means `few`) store the choice, so it is never asked twice; a failed load shows nothing, the
 * profile offers the same choice at any time.
 */
export function KeeperStyleQuestion(props: { api: string; token: Token; onDone?: () => void }) {
  const [state, setState] = useState<"loading" | "ask" | "done">("loading");
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    void (async () => {
      const t = await props.token();
      const r = t ? await loadKeeperStyle(props.api, t) : null;
      if (current) setState(r?.ok && !r.value.chosen ? "ask" : "done");
    })();
    return () => {
      current = false;
    };
  }, [props.api, props.token]);
  if (state === "done" && saved)
    return (
      <p role="status" className="m-0">
        {saved}
      </p>
    );
  if (state !== "ask") return null;
  return (
    <Question
      api={props.api}
      token={props.token}
      onDone={(s) => {
        setSaved(styleMessage(s.style));
        setState("done");
        props.onDone?.();
      }}
    />
  );
}

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button/button";
import { Skeleton, SkeletonGroup } from "@/components/ui/display/skeleton/skeleton";
import { LoadFrame, useInvalidate } from "../../../kernel";
import { loadKeeperStyle, type KeeperStyleState } from "./keeper-style-api";
import { Refusal, StyleButtons, StyleSelect, useSaveStyle } from "./style-parts/style-parts";

type Token = () => Promise<string | undefined>;

function StyleFieldset(props: { api: string; token: Token; state: KeeperStyleState }) {
  const [style, setStyle] = useState(props.state.style);
  const [message, setMessage] = useState<string | null>(null);
  const refresh = useInvalidate(["onboarding"]);
  const { save, saving, error } = useSaveStyle(props, (s) => {
    setStyle(s.style);
    setMessage(
      s.style === "many"
        ? "Alles ist jetzt offen."
        : "Neue Funktionen zeigt dir die App nach und nach.",
    );
    refresh();
  });
  return (
    <fieldset className="m-0 flex min-w-0 flex-col rounded-lg border-2 border-border px-3 pb-2 pt-1">
      <legend className="px-1 font-semibold">Wie nutzt du die App?</legend>
      <StyleSelect value={style} disabled={saving} onPick={(s) => void save(s)} />
      <p className="mt-1 text-sm text-muted-foreground">
        Du kannst das jederzeit ändern. Was du schon geöffnet hast, bleibt offen.
      </p>
      <Refusal error={error} />
      {message && (
        <p role="status" className="mt-2 rounded-lg border border-border p-3">
          {message}
        </p>
      )}
    </fieldset>
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

function Question(props: { api: string; token: Token; onDone: () => void }) {
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
  if (state !== "ask") return null;
  return (
    <Question
      api={props.api}
      token={props.token}
      onDone={() => {
        setState("done");
        props.onDone?.();
      }}
    />
  );
}

import type { CaughtSpecies } from "@pflanzendex/core";
import { newlyCaught } from "@pflanzendex/core";
import { useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { errorText } from "@/lib/error-text";
import { useInvalidate, useRequest, useWriteAction } from "../../kernel";
import { loadSeen, markSeen } from "../seen-api";

const SEEN_KEY = ["pokedex", "seen"] as const;

/**
 * The banner "Neu gefangen: …" (US-POK-12): the caught species the keeper has not seen yet, derived as caught minus
 * the seen state the server holds per account (P-01, P-04). It stays until "Okay" writes the seen state. On the first
 * visit (no state yet) the state is created silently with the current caught species and no banner shows. A read error
 * never breaks the page: the banner is simply absent (the page itself has its own load error handling).
 */
export function NewlyCaught(props: {
  api: string;
  token: () => Promise<string | undefined>;
  caught: readonly CaughtSpecies[];
}) {
  const { api, token, caught } = props;
  const load = useCallback((t: string) => loadSeen(api, t), [api]);
  const seen = useRequest({ queryKey: SEEN_KEY, token, load });
  const reload = useInvalidate(SEEN_KEY);
  const write = useWriteAction(token, reload);
  const created = useRef(false);

  const missing = seen.status === "ready" && seen.value === null;
  useEffect(() => {
    if (!missing || created.current) return;
    created.current = true;
    // Silent creation (US-POK-12): no message, no banner; a failure is retried at the next visit.
    void write.run(
      (t) =>
        markSeen(
          api,
          t,
          caught.map((c) => c.species),
        ),
      "",
    );
  }, [missing, api, caught, write]);

  if (seen.status !== "ready" || seen.value === undefined) return null;
  const fresh = newlyCaught(caught, seen.value);
  if (fresh.length === 0) return null;
  const names = fresh.map((c) => c.species);
  return (
    <section
      role="status"
      aria-label="Neu gefangen"
      className="mb-3 grid gap-2 rounded-lg border border-primary p-3"
    >
      <p className="font-semibold">{`Neu gefangen: ${names.join(", ")}`}</p>
      {write.error && (
        <p role="alert" className="text-destructive">
          {errorText(write.error.code)}
        </p>
      )}
      <Button
        variant="outline"
        pending={write.running}
        pendingLabel="Wird gespeichert …"
        onClick={() => void write.run((t) => markSeen(api, t, names), "")}
      >
        Okay
      </Button>
    </section>
  );
}

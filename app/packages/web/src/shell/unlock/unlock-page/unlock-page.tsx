import { useCallback, useEffect, useRef } from "react";
import { Link, useParams } from "react-router";
import { Button } from "@/components/ui/button/button";
import { PlantLoader } from "@/components/shared/states/plant-loader/plant-loader";
import { errorText } from "@/lib/error-text";
import { useInvalidate, useWriteAction } from "../../../kernel";
import { PATHS } from "../../../components/shared/navigation/nav-model/navigation/navigation";
import { unlockFunction } from "../model/unlock-api";
import {
  functionAddress,
  functionEmpty,
  functionName,
  lockMark,
  waysText,
} from "../model/unlock-texts";
import { UNLOCKS_KEY, useUnlocks } from "../model/unlocks/unlocks";

type Token = () => Promise<string | undefined>;
type Entry = NonNullable<ReturnType<typeof useUnlocks>["entries"][number]>;

const LINK =
  "inline-flex min-h-[44px] items-center rounded-control px-1 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const ALERT =
  "rounded-lg border border-destructive p-3 text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Why the page cannot show the function yet: still loading, failed (with retry, P-10) or unknown (leads on, P-09). */
function Unavailable(props: { name: string; status: "pending" | "error" | "unknown" }) {
  const { retry, errorCode } = useUnlocks();
  if (props.status === "pending")
    return <PlantLoader label="Funktion wird geladen …" size="lg" className="mx-auto my-8 flex" />;
  if (props.status === "error")
    return (
      <section aria-labelledby="unlock-title" className="flex flex-col gap-3">
        <h1 id="unlock-title" className="text-2xl font-semibold">
          {props.name}
        </h1>
        <p role="alert" className={ALERT}>
          {errorText(errorCode)}
        </p>
        <div>
          <Button type="button" onClick={retry}>
            Erneut versuchen
          </Button>
        </div>
      </section>
    );
  return (
    <section aria-labelledby="unlock-title" className="flex flex-col gap-3">
      <h1 id="unlock-title" className="text-2xl font-semibold">
        Diese Funktion gibt es hier nicht
      </h1>
      <p>Zurück zum Start findest du alles, was die App für dich bereithält.</p>
      <Link to={PATHS.start} className={LINK}>
        Zum Start
      </Link>
    </section>
  );
}

/** The locked case: the way as a plain fact and the tap that opens the function for good (DM-ONB-02). */
function LockedBody(props: { entry: Entry; name: string; running: boolean; onUnlock: () => void }) {
  return (
    <>
      <p>
        <span className="mr-2 rounded-control border border-border px-2 text-sm font-semibold">
          {lockMark(props.entry)}
        </span>
        {props.name}: {waysText(props.entry)}.
      </p>
      <p>
        Du kannst die Funktion jederzeit selbst freischalten, auch wenn das noch nicht erfüllt ist.
      </p>
      <div>
        <Button type="button" disabled={props.running} onClick={props.onUnlock}>
          Jetzt freischalten
        </Button>
      </div>
    </>
  );
}

/** The tap removes the button the focus was on: the heading takes it, the status line is announced as before. */
function useFocusOn(message: string | null) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (message) heading.current?.focus();
  }, [message]);
  return heading;
}

/**
 * The page of a function that is not open yet, reached from a row, a bookmark or the AI client (US-ONB-05, FR-ONB-02):
 * the reason and the way in plain words and "Jetzt freischalten". It is never blank, never an error and never a 404
 * (P-09): an open or unknown function says so and leads on. One tap stores the unlock; it is never revoked.
 */
export function UnlockPage(props: { api: string; token: Token; id?: string }) {
  const params = useParams();
  const id = props.id ?? params["id"] ?? "";
  const unlocks = useUnlocks();
  const refresh = useInvalidate(UNLOCKS_KEY);
  const write = useWriteAction(props.token, refresh);
  const { run } = write;
  const heading = useFocusOn(write.message);
  const name = functionName(id);
  const entry = unlocks.entries.find((e) => e.id === id);
  const unlock = useCallback(
    () =>
      run(
        (t) => unlockFunction(props.api, t, id),
        `${name} ist jetzt freigeschaltet. ${functionEmpty(id)}`.trim(),
      ),
    [run, props.api, id, name],
  );
  if (unlocks.status !== "ready" || !entry)
    return (
      <Unavailable name={name} status={unlocks.status === "ready" ? "unknown" : unlocks.status} />
    );
  const locked = entry.state === "locked" && entry.announced;
  return (
    <section aria-labelledby="unlock-title" className="flex flex-col gap-3">
      <h1 ref={heading} tabIndex={-1} id="unlock-title" className="text-2xl font-semibold">
        {name}
      </h1>
      {write.message && (
        <p role="status" className="rounded-lg border border-border p-3">
          {write.message}
        </p>
      )}
      {write.error && (
        <p role="alert" className={ALERT}>
          {write.error.code === "network.not_reachable"
            ? write.error.text
            : errorText(write.error.code)}
        </p>
      )}
      {locked ? (
        <LockedBody
          entry={entry}
          name={name}
          running={write.running}
          onUnlock={() => void unlock()}
        />
      ) : (
        <>
          {!write.message && <p>{name} ist offen.</p>}
          <Link to={functionAddress(id)} className={LINK}>
            {name} öffnen
          </Link>
        </>
      )}
    </section>
  );
}

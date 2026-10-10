import { useCallback } from "react";
import { Button } from "@/components/ui/button/button";
import { LoadFrame, useInvalidate, useWriteAction } from "../../../kernel";
import { loadSubscriptions, removeSubscription } from "../../api/reminders-api";

type Token = () => Promise<string | undefined>;
const KEY = ["monitoring", "subscriptions"] as const;

/** The service of a push address, enough to tell the browsers apart without showing the long secret path. */
const host = (endpoint: string) => {
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
};

function List(props: { api: string; token: Token; endpoints: readonly string[] }) {
  const again = useInvalidate(KEY);
  const write = useWriteAction(props.token, again);
  return (
    <div className="flex max-w-xl flex-col gap-3">
      <p className="m-0 text-sm text-muted-foreground">
        Der Versand per Push ist noch nicht eingerichtet: Erinnerungen erscheinen im Posteingang.
        Hier siehst du, welche Browser sich für Push angemeldet haben, und kannst sie abmelden.
      </p>
      {props.endpoints.length === 0 ? (
        <p className="m-0">Kein Browser ist für Push angemeldet.</p>
      ) : (
        <ul aria-label="Push-Geräte" className="m-0 flex list-none flex-col gap-2 p-0">
          {props.endpoints.map((endpoint) => (
            <li
              key={endpoint}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
            >
              <span>Browser über {host(endpoint)}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={write.running}
                aria-label={`Browser über ${host(endpoint)} abmelden`}
                onClick={() =>
                  void write.run(
                    (t) => removeSubscription(props.api, t, endpoint),
                    "Browser abgemeldet.",
                  )
                }
              >
                Abmelden
              </Button>
            </li>
          ))}
        </ul>
      )}
      {write.error && (
        <p role="alert" className="rounded-lg border border-destructive p-3">
          {write.error.text}
        </p>
      )}
      {write.message && (
        <p role="status" className="rounded-lg border border-border p-3">
          {write.message}
        </p>
      )}
    </div>
  );
}

/** Management of the push subscriptions (US-MON-08): the registered browsers and the way to remove one. */
export function Subscriptions(props: { api: string; token: Token }) {
  const load = useCallback((t: string) => loadSubscriptions(props.api, t), [props.api]);
  return (
    <LoadFrame
      queryKey={KEY}
      token={props.token}
      load={load}
      loadingText="Push-Geräte werden geladen …"
    >
      {(endpoints) => <List api={props.api} token={props.token} endpoints={endpoints} />}
    </LoadFrame>
  );
}

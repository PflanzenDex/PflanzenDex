import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import type { Account } from "./account-api";

type Action = () => void;

const CARD =
  "flex w-full max-w-md min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-5";
const ACTIONS = "flex flex-col gap-3 sm:flex-row";

export function Welcome(props: { onRegister: Action; onSignIn: Action; hint?: string }) {
  return (
    <section aria-labelledby="title" className={CARD}>
      <h1 id="title" className="text-2xl font-semibold">
        PflanzenDex
      </h1>
      <p className="text-muted-foreground">
        Deine Pflanzen, deine Sammlung. Lege ein Konto an, um zu starten.
      </p>
      {props.hint && (
        <p role="status" className="rounded-lg border border-border p-3">
          {props.hint}
        </p>
      )}
      <div className={ACTIONS}>
        <Button type="button" size="touch" onClick={props.onRegister} className="sm:flex-1">
          Konto anlegen
        </Button>
        <Button
          type="button"
          variant="outline"
          size="touch"
          onClick={props.onSignIn}
          className="sm:flex-1"
        >
          Anmelden
        </Button>
      </div>
    </section>
  );
}

export function AccountView(props: {
  account: Account;
  onSignOut: Action;
  onEverywhereSignOut: Action;
  error?: string;
}) {
  const { account } = props;
  return (
    <section aria-labelledby="title" className={CARD}>
      <h1 id="title" className="text-2xl font-semibold [overflow-wrap:anywhere]">
        Hallo{account.displayName ? `, ${account.displayName}` : ""}
      </h1>
      <dl className="m-0">
        <dt className="text-sm text-muted-foreground">E-Mail</dt>
        <dd className="m-0 [overflow-wrap:anywhere]">{account.email}</dd>
      </dl>
      {!account.emailConfirmed && (
        <p
          role="alert"
          className="rounded-lg border border-warning-border bg-warning p-3 text-warning-foreground"
        >
          E-Mail-Adresse bestätigen: Wir haben dir einen Link geschickt. Teilen mit Freunden ist
          erst danach möglich.
        </p>
      )}
      {props.error && (
        <p
          role="alert"
          className="rounded-lg border border-warning-border bg-warning p-3 text-warning-foreground"
        >
          {props.error}
        </p>
      )}
      <div className={ACTIONS}>
        <Button type="button" size="touch" onClick={props.onSignOut} className="sm:flex-1">
          Abmelden
        </Button>
        <Button
          type="button"
          variant="outline"
          size="touch"
          onClick={props.onEverywhereSignOut}
          className="sm:flex-1"
        >
          Auf allen Geräten abmelden
        </Button>
      </div>
    </section>
  );
}

/** Placeholder with the layout of the signed-in card while the session is checked (DS-52, DS-53). */
export function Loading() {
  return (
    <SkeletonGroup label="Einen Moment, die Anmeldung wird geprüft …" className={CARD}>
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-12 w-full" />
    </SkeletonGroup>
  );
}

export function AppError(props: { text: string; onReload: Action }) {
  return (
    <EmptyState
      variant="error"
      title={props.text}
      action={{ label: "Erneut versuchen", onClick: props.onReload }}
      className="w-full max-w-md"
    />
  );
}

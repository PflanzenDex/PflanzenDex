import { EmptyState } from "@/components/shared/empty-state/empty-state";
import { Button } from "@/components/ui/button/button";
import { Skeleton, SkeletonGroup } from "@/components/ui/display/skeleton/skeleton";
import { DISPLAY_NAME } from "@/components/shared/navigation/nav-model/nav-item";
import type { Account } from "../api/account-api";

type Action = () => void;

const CARD =
  "flex w-full max-w-md min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-5";
const ACTIONS = "flex flex-col gap-3 sm:flex-row";

export function Welcome(props: { onRegister: Action; onSignIn: Action; hint?: string }) {
  return (
    <section aria-labelledby="title" className={CARD}>
      <h1 id="title" className="text-2xl font-semibold">
        {DISPLAY_NAME}
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

const NOTICE = "rounded-lg border border-warning-border bg-warning p-3 text-warning-foreground";

/** What needs attention before anything else: the unconfirmed e-mail address and the error of the last sign-in step. */
function Notices(props: { account: Account; error?: string }) {
  return (
    <>
      {!props.account.emailConfirmed && (
        <p role="alert" className={NOTICE}>
          E-Mail-Adresse bestätigen: Wir haben dir einen Link geschickt. Teilen mit Freunden ist
          erst danach möglich.
        </p>
      )}
      {props.error && (
        <p role="alert" className={NOTICE}>
          {props.error}
        </p>
      )}
    </>
  );
}

/**
 * The profile card of "Konto" (US-QS-14): avatar tile, name, e-mail and the ways to sign out. It has no heading of its
 * own: the destination names it "Profil" and carries the one h1.
 */
export function AccountView(props: {
  account: Account;
  onSignOut: Action;
  onEverywhereSignOut: Action;
  error?: string;
}) {
  const { account } = props;
  const name = account.displayName || account.email;
  return (
    <div className="flex w-full min-w-0 max-w-xl flex-col gap-4 rounded-card bg-card p-5 shadow-elevation-1">
      <div className="flex min-w-0 items-center gap-4">
        <span
          aria-hidden="true"
          className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-accent text-xl font-semibold text-accent-foreground"
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
        <dl className="m-0 min-w-0">
          <dt className="sr-only">Name</dt>
          <dd className="m-0 text-lg font-semibold [overflow-wrap:anywhere]">
            Hallo{account.displayName ? `, ${account.displayName}` : ""}
          </dd>
          <dt className="sr-only">E-Mail</dt>
          <dd className="m-0 text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {account.email}
          </dd>
        </dl>
      </div>
      <Notices account={account} {...(props.error ? { error: props.error } : {})} />
      <div className={ACTIONS}>
        <Button
          type="button"
          variant="outline"
          size="touch"
          onClick={props.onSignOut}
          className="sm:flex-1"
        >
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
    </div>
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

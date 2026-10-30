import { Button } from "@/components/ui/button/button";
import type { Account } from "../../api/account-api";

type Action = () => void;

const ACTIONS = "flex flex-col gap-3 sm:flex-row";

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

/** What the app records about the use and what never leaves the account (US-QS-05, #305): every point is true today. */
const MEASURED = [
  "Keine Klickzählung und keine Nutzungsanalyse: PflanzenDex zählt nicht, was du antippst oder wie lange du die App nutzt, und bindet keine Werbe- oder Analysedienste ein.",
  "Bei jeder Anmeldung speichern wir, wann du zuletzt aktiv warst. Der Betreiber sieht davon nur die Zahl der aktiven Konten der letzten 30 Tage, nie deinen Zeitpunkt.",
  "Fotos zu deinen Messungen speichern wir ohne Ort- und Kameradaten (EXIF/GPS) und verkleinert; nur du kannst sie sehen.",
  "Standort, Notizen, Behandlungen und Preise deiner Pflanzen sehen Freunde nie, auch nicht bei geteilten Pflanzen.",
  "Bilder auf Sammlerkarten und Vorschlägen lädt dein Gerät direkt von Wikipedia (Wikimedia).",
] as const;

export function MeasuredView() {
  return (
    <ul className="m-0 grid list-disc gap-2 pl-5">
      {MEASURED.map((text) => (
        <li key={text}>{text}</li>
      ))}
    </ul>
  );
}

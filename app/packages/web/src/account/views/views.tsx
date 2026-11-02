import { EmptyState } from "@/components/shared/empty-state/empty-state";
import { Button } from "@/components/ui/button/button";
import { Skeleton, SkeletonGroup } from "@/components/ui/display/skeleton/skeleton";
import { DISPLAY_NAME } from "@/components/shared/navigation/nav-model/nav-item";
import { AuthFrame } from "./auth-frame/auth-frame";

type Action = () => void;

const CARD =
  "flex w-full max-w-md min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-5";
const ACTIONS = "flex flex-col gap-3";

/**
 * The welcome page in the frame of the sign-in pages (US-QS-14): the wordmark, one line of text, the filled sign-in
 * button and the outline registration button, in that order, as on the sign-in service.
 */
export function Welcome(props: { onRegister: Action; onSignIn: Action; hint?: string }) {
  return (
    <AuthFrame>
      <section aria-labelledby="title" className="flex flex-col gap-4">
        <h1 id="title" className="text-[1.5rem] leading-tight font-bold">
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
          <Button type="button" size="touch" onClick={props.onSignIn} className="text-base">
            Anmelden
          </Button>
          <Button
            type="button"
            variant="outline"
            size="touch"
            onClick={props.onRegister}
            className="text-base"
          >
            Konto anlegen
          </Button>
        </div>
      </section>
    </AuthFrame>
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

import { EmptyState } from "@/shared/patterns/elements/empty-state/empty-state";
import { Button } from "@/shared/ui/button/button";
import { Skeleton, SkeletonGroup } from "@/shared/ui/display/skeleton/skeleton";
import { DISPLAY_NAME } from "@/shared/patterns/navigation/nav-item";
import { texts } from "@/shared/lib/text-rules/texts";
import { AuthFrame } from "./auth-frame/auth-frame";
import table from "./views.de.json";

const t = texts(table);

type Action = () => void;

const CARD =
  "flex w-full max-w-md min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-5";
const ACTIONS = "flex flex-col gap-3";
const NOTICE = "rounded-lg border border-warning-border bg-warning p-3 text-warning-foreground";

/**
 * The welcome page in the frame of the sign-in pages (US-QS-14): the wordmark, one line of text, the filled sign-in
 * button and the outline registration button, in that order, as on the sign-in service. Below them the text action
 * "Anderes Konto" (US-ACC-01): it ends the session at the sign-in service, so another person can sign in.
 */
export function Welcome(props: {
  onRegister: Action;
  onSignIn: Action;
  onAnotherAccount: Action;
  hint?: string | undefined;
  /**
   * The error of a failed press on this page (US-ACC-01): "Anmelden", "Konto anlegen" or "Anderes Konto". It says what
   * to do, and the buttons stay for another try.
   */
  error?: string | undefined;
}) {
  return (
    <AuthFrame>
      <section aria-labelledby="title" className="flex flex-col gap-4">
        <h1 id="title" className="text-[1.5rem] leading-tight font-bold">
          {DISPLAY_NAME}
        </h1>
        <p className="text-muted-foreground">{t("welcome.tagline")}</p>
        {props.hint && (
          <p role="status" className="rounded-lg border border-border p-3">
            {props.hint}
          </p>
        )}
        {props.error && (
          <p role="alert" className={NOTICE}>
            {props.error}
          </p>
        )}
        <div className={ACTIONS}>
          <Button type="button" size="touch" onClick={props.onSignIn} className="text-base">
            {t("welcome.signIn")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="touch"
            onClick={props.onRegister}
            className="text-base"
          >
            {t("welcome.register")}
          </Button>
          <Button
            type="button"
            variant="link"
            size="touch"
            onClick={props.onAnotherAccount}
            className="text-base"
          >
            {t("welcome.otherAccount")}
          </Button>
        </div>
      </section>
    </AuthFrame>
  );
}

/** Placeholder with the layout of the signed-in card while the session is checked (DS-52, DS-53). */
export function Loading() {
  return (
    <SkeletonGroup label={t("loading.label")} className={CARD}>
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-12 w-full" />
    </SkeletonGroup>
  );
}

/**
 * A failed load says what happened. "Erneut versuchen" asks again; with `reloadPage` (the sign-in library did not load,
 * US-ACC-01) the button reloads the page, because a retry in the same page load cannot load the library.
 */
export function AppError(props: {
  text: string;
  onReload: Action;
  reloadPage?: boolean | undefined;
}) {
  return (
    <EmptyState
      variant="error"
      title={props.text}
      action={
        props.reloadPage
          ? { label: t("error.reloadPage"), onClick: () => window.location.reload() }
          : { label: t("error.retry"), onClick: props.onReload }
      }
      className="w-full max-w-md"
    />
  );
}

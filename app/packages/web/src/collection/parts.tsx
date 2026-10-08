import type { ReactNode } from "react";
import type { SpecimenCard } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { useStoredPhoto, type PhotoAccess } from "@/lib/use-stored-photo";
import { refusalText } from "./refusal";
import { dateText } from "./text";
import { cn } from "@/lib/utils";

/** The card of a page of the module: the former `.light` frame, on tokens (DS-27). */
export function PageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card px-4 py-6 text-card-foreground md:p-7">
      {children}
    </div>
  );
}

/** A page shown inside another destination is not framed in a card of its own (US-QS-14). */
export function Plain({ children }: { children: ReactNode }) {
  return <div className="min-w-0">{children}</div>;
}

export const TITLE = "mb-2 text-2xl font-semibold";
export const SUBTITLE = "mb-1 text-xl font-semibold";

/** Layout of the card grids (upward only, DS-12): one column on a phone, more as there is room. */
export const GRID = "m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3";
/** The care profile cards are wider (a row of controls each): two columns at most. */
export const PROFILE_GRID = "m-0 grid list-none grid-cols-1 gap-3 p-0 lg:grid-cols-2";
export const CARD =
  "grid min-w-0 content-start gap-1 break-words rounded-card bg-secondary p-3 text-secondary-foreground";

/** Secondary text: explanations, the "Art:" lines of a card. */
export function Quiet(props: { children: ReactNode; className?: string; live?: boolean }) {
  return (
    <p
      className={cn("text-sm text-muted-foreground", props.className)}
      aria-live={props.live ? "polite" : undefined}
    >
      {props.children}
    </p>
  );
}

/** What a view says to do next (P-09). */
export function NextAction({ children }: { children: ReactNode }) {
  return <p className="font-semibold">{children}</p>;
}

/** The result of an action ("saved", "archived"), announced politely (P-10). */
export function Status({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="mb-3 rounded-lg border border-border p-3">
      {children}
    </p>
  );
}

/** A refusal or problem that stays visible until the keeper acts (P-10); the warning tokens, not red alone (DS-38). */
export function Warning({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="mb-3 grid gap-1 rounded-lg border border-warning-border bg-warning p-3 text-warning-foreground"
    >
      {children}
    </div>
  );
}

/** A row of buttons: wraps as whole buttons instead of breaking inside a word. */
export function Actions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mt-3 flex flex-wrap gap-2", className)}>{children}</div>;
}

/** The buttons of a form: stacked full-width on a phone, side by side from `sm`; the submit shows its pending state (DS-50). */
export function FormButtons(props: {
  submit: string;
  cancel: string;
  pending: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Button type="submit" size="touch" pending={props.pending}>
        {props.submit}
      </Button>
      <Button type="button" size="touch" variant="outline" onClick={props.onCancel}>
        {props.cancel}
      </Button>
    </div>
  );
}

/** The latest photo (US-WAC-05): private, fetched with the token and shown from an object URL (P-05, P-10). */
export function Photo({ card, access }: { card: SpecimenCard; access: PhotoAccess }) {
  const state = useStoredPhoto(access, card.photo?.url);
  if (!card.photo) {
    return (
      <div className="grid min-h-[72px] place-items-center rounded-lg border border-dashed border-border text-muted-foreground">
        <span>Noch kein Foto</span>
      </div>
    );
  }
  if (typeof state !== "string") return <Quiet>{state ? refusalText(state) : "Lädt …"}</Quiet>;
  return (
    <a
      className="block aspect-[4/3] overflow-hidden rounded-lg bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      href={state}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Foto von ${card.name} groß öffnen`}
    >
      <img
        className="block size-full object-cover"
        src={state}
        alt={`Foto von ${card.name} vom ${dateText(card.photo.date)}`}
      />
    </a>
  );
}

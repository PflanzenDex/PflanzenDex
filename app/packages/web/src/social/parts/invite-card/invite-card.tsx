import type { CreatedFriendCode } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";

/** Calendar date of an instant in the viewer's time zone (NFR-08), e.g. 13.10.2026. */
export const dateText = (iso: string): string =>
  new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

/**
 * "Einladen", the first tab of the layer "Freund hinzufügen" (US-SOZ-01, US-QS-20): creates a single-use code that is passed on outside the app. There is no user
 * search, friends find each other only this way (FR-SOZ-08). The code is shown exactly once (only its hash exists).
 */
export function InviteCard(props: {
  created: CreatedFriendCode | null;
  running: boolean;
  onCreate: () => void;
}) {
  const { created } = props;
  return (
    <section aria-label="Freund einladen" className="flex min-w-0 flex-col gap-3">
      <p className="text-muted-foreground">Gib den Code außerhalb der App weiter.</p>
      <div>
        <Button type="button" size="touch" disabled={props.running} onClick={props.onCreate}>
          {props.running ? "Erzeugt …" : "Einladungscode erzeugen"}
        </Button>
      </div>
      {created && (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-lg border-2 border-primary px-3 py-2"
        >
          <p>
            <code
              aria-label="Dein Freundescode"
              className="select-all text-xl tracking-widest [overflow-wrap:anywhere]"
            >
              {created.code}
            </code>
          </p>
          <p>
            Einmal verwendbar, gültig bis {dateText(created.expiresAt)}. Der Code wird nur jetzt
            angezeigt: Gib ihn weiter oder notiere ihn.
          </p>
        </div>
      )}
    </section>
  );
}

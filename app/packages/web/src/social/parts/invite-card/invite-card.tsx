import type { CreatedFriendCode } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";

/** Calendar date of an instant in the viewer's time zone (NFR-08), e.g. 13.10.2026. */
export const dateText = (iso: string): string =>
  new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

/**
 * "Freund einladen" (US-SOZ-01): creates a single-use code that is passed on outside the app. There is no user
 * search, friends find each other only this way (FR-SOZ-08). The code is shown exactly once (only its hash exists).
 */
export function InviteCard(props: {
  created: CreatedFriendCode | null;
  running: boolean;
  onCreate: () => void;
}) {
  const { created } = props;
  return (
    <section aria-labelledby="friend-invite-title" className="flex min-w-0 flex-col gap-3">
      <h2 id="friend-invite-title" className="text-xl font-semibold">
        Freund einladen
      </h2>
      <p className="text-muted-foreground">
        Erzeuge einen Code und gib ihn außerhalb der App weiter. Wer ihn eingibt, schickt dir eine
        Anfrage; erst wenn du sie annimmst, seid ihr befreundet.
      </p>
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

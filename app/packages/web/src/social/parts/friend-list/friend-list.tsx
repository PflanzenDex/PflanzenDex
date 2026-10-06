import type { Friend } from "@pflanzendex/core";
import { dateText } from "../invite-card/invite-card";
import { nameOf } from "../request-list/request-list";

/**
 * The confirmed friends (US-SOZ-02): display name and since when, nothing from their collections yet: what a friend
 * sees is decided per specimen, private by default (US-SOZ-04, P-05). No rankings, no counts against each other.
 */
export function FriendList(props: { friends: readonly Friend[] }) {
  return (
    <section aria-labelledby="friend-list-title" className="flex min-w-0 flex-col gap-3">
      <h2 id="friend-list-title" className="text-xl font-semibold">
        Meine Freunde
      </h2>
      {props.friends.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-3">
          Noch keine Freunde. Nimm eine Anfrage an oder lade jemanden mit einem Code ein.
        </p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0" aria-label="Freunde">
          {props.friends.map((f) => (
            <li key={f.id} className="grid break-words rounded-lg border border-border p-3">
              <span>{nameOf(f.name)}</span>
              <span className="text-sm text-muted-foreground">
                befreundet seit {dateText(f.since)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

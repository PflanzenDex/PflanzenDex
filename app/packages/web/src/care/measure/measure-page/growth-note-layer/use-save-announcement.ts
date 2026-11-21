import { useEffect, useRef, useState } from "react";
import { growthNoteText, type GrowthMoments } from "@/achievements";
import { useAnnounce } from "@/shared/platform/announcer/context";
import type { Say } from "@/shared/patterns/states/toast/toast-provider/toast-provider";

/**
 * Says the result of each save once, with the growth note of that save (US-QS-08, issue 2323). The confirmation
 * ("Gesichert: …") and its growth note are one text, because the announcer has one polite region, and a second text
 * would replace the first. When the note of the save is known at the confirmation, the text with the note is said once.
 * When it is not, the confirmation is said alone, and the text with the note follows when the note arrives; a note that
 * never comes leaves the confirmation alone. A refused photo confirms nothing, so nothing is said. The note of a save is
 * read only from a current answer (`stale` is not set): the copy on screen from before the save is never read (issue 1795).
 */
export function useSaveAnnouncement(props: {
  /** The save count of the view (`saves` of `useMeasureSend`): a new save starts a new announcement. */
  saves: number;
  /** The confirmed text of the current save (`confirmed` of `useMeasureSend`); `null` while it is pending or refused. */
  confirmed: string | null;
  moments: GrowthMoments | null;
  /** Says the confirmation: the announcer, or a toast without one (`useSay`, US-QS-07). */
  say: Say;
}): void {
  const { saves, confirmed, moments, say } = props;
  const announce = useAnnounce()?.announce;
  // Without an announcer (stories, isolated tests) the note is not read at all: it stays on its card, and the
  // confirmation is a toast that carries no note (issue 2323, the toast is the fallback of `useSay`).
  const current = moments !== null && moments.stale !== true;
  // The read after a save may answer during a photo upload, and the view reads again after the photo is stored (its
  // refresh): that second read is in flight at the confirmation. An answer seen for this save stays the answer of it.
  const [latched, setLatched] = useState<number | null>(null);
  useEffect(() => {
    if (current) setLatched(saves);
  }, [current, saves]);
  const answered = current || latched === saves;
  const note =
    announce && answered && moments ? growthNoteText({ moments, justSaved: true }) : null;
  const told = useRef<{ save: number; waiting: boolean } | null>(null);
  useEffect(() => {
    if (confirmed === null) return;
    const said = told.current;
    if (said?.save !== saves) {
      // The first text of this save: with its note when the note is known now, alone otherwise.
      told.current = { save: saves, waiting: !answered };
      say(note ? `${confirmed} ${note}` : confirmed);
      return;
    }
    // The note arrives after the confirmation: the confirmation comes again, now with its note, once.
    if (said.waiting && answered) {
      told.current = { save: saves, waiting: false };
      if (note) announce?.(`${confirmed} ${note}`);
    }
  }, [announce, answered, confirmed, note, say, saves]);
}

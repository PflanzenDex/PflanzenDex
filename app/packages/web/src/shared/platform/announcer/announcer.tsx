import { useMemo, useState, type ReactNode } from "react";
import { OverlayNotice } from "@/shared/patterns/states/overlay-notice/overlay-notice";
import { Context, type Api, type Channel } from "./context";

const NO_BREAK_SPACE = " ";

/**
 * The one polite live region of the app (US-QS-09 view titles, US-QS-10 results and offline states). It is in the
 * page before the first message, because a screen reader only notices a change in a region it already knows.
 * The same text twice in a row gets a trailing no-break space, otherwise the second one would not be read.
 * An announcement with a `shown` text (offline states) also shows it as a note in an overlay, so the state is text
 * everyone sees (4.1.3, P-10); the overlay covers the page and never moves it (DS-54). The sender takes it away again.
 */
export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);
  // The channel is created once, so a sender's reference never changes when the note does.
  const [channel] = useState<Channel>(() => {
    const announce = (message: string, shown?: string | null) => {
      if (message) setText((last) => (last === message ? message + NO_BREAK_SPACE : message));
      if (shown !== undefined) setNote(shown);
    };
    return {
      announce,
      buffer: (write) => import("./outbox").then((m) => m.bufferWrite(announce, write)),
    };
  });
  const api = useMemo<Api>(() => ({ ...channel, note }), [channel, note]);
  return (
    <Context.Provider value={api}>
      {children}
      {note ? <OverlayNotice>{note}</OverlayNotice> : null}
      <div aria-live="polite" className="sr-only">
        {text}
      </div>
    </Context.Provider>
  );
}

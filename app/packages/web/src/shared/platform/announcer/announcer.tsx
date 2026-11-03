import { useState, type ReactNode } from "react";
import { Context, type Api } from "./context";

const NO_BREAK_SPACE = "\u00a0";

/**
 * The one polite live region of the app (US-QS-09 view titles, US-QS-10 results and offline states). It is in the
 * page before the first message, because a screen reader only notices a change in a region it already knows.
 * The same text twice in a row gets a trailing no-break space, otherwise the second one would not be read.
 * An announcement with a `shown` text (offline states) also shows it as a note at the top of the page, so the state
 * is text everyone sees (4.1.3, P-10); the sender takes it away again.
 */
export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [api] = useState<Api>(() => {
    const announce = (message: string, shown?: string | null) => {
      if (message) setText((last) => (last === message ? message + NO_BREAK_SPACE : message));
      if (shown !== undefined) setNote(shown);
    };
    return {
      announce,
      buffer: (write) => import("./outbox").then((m) => m.bufferWrite(announce, write)),
    };
  });
  return (
    <Context.Provider value={api}>
      {note && <p className="m-4 rounded-lg border border-border p-3">{note}</p>}
      {children}
      <div aria-live="polite" className="sr-only">
        {text}
      </div>
    </Context.Provider>
  );
}

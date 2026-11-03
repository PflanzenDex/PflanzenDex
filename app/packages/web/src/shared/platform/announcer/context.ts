import { createContext, useContext } from "react";
import type { Write } from "./outbox";

export type Api = {
  /** Says `text` to screen readers; `shown` also puts a text on screen as a note, `null` takes the note away. */
  announce: (text: string, shown?: string | null) => void;
  /** Holds a write until the network is back and says so; loads the buffer on first use (DS-08). Settles on delivery. */
  buffer: (write: Write) => Promise<void>;
};

export const Context = createContext<Api | null>(null);

/**
 * Tells a screen reader what the app did (US-QS-10, WCAG 4.1.3) without moving the focus. `null` outside an
 * announcer (stories, isolated tests): there is nobody to tell, and callers then behave as before.
 */
export const useAnnounce = () => useContext(Context);

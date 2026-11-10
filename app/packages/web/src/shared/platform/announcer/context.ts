import { createContext, useContext } from "react";
import type { Write } from "./outbox";

/** The announcer's channel: what a sender calls. Stable for the life of the provider. */
export type Channel = {
  /** Says `text` to screen readers; `shown` also puts a text on screen as a note, `null` takes the note away. */
  announce: (text: string, shown?: string | null) => void;
  /** Holds a write until the network is back and says so; loads the buffer on first use (DS-08). Settles on delivery. */
  buffer: (write: Write) => Promise<void>;
};

/** The channel plus the note on screen (the buffered-write state or a delivery result), `null` when there is none. */
export type Api = Channel & {
  /** The note the provider shows as an overlay; the shell's offline bar yields to it (US-QS-10, DS-54). */
  note: string | null;
};

export const Context = createContext<Api | null>(null);

/**
 * Tells a screen reader what the app did (US-QS-10, WCAG 4.1.3) without moving the focus. `null` outside an
 * announcer (stories, isolated tests): there is nobody to tell, and callers then behave as before.
 */
export const useAnnounce = () => useContext(Context);

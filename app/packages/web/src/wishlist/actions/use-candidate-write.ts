import { useState } from "react";
import type { Candidate } from "@pflanzendex/core";
import { entityKey, useWriteAction, type Response, type WriteOptions } from "../../shared/data";
import { buyWish, discardWish, storeWishImage } from "../wishlist-api";

export type Token = () => Promise<string | undefined>;
export type Hint = { text: string; nextAction: string };

/** A bought wish that becomes a plant (US-WUN-05): what the app needs to find its species and to link the specimen. */
export interface WishToPlant {
  readonly id: string;
  /** Latin or working name, the start of the species search. */
  readonly name: string;
  /** "German (name)", for texts. */
  readonly title: string;
}

/** What a write on a candidate answered: the hint, and for a purchase the wish that can now become a plant. */
export interface Outcome {
  readonly hint: Hint;
  readonly toPlant: WishToPlant | null;
}

/**
 * "Gekauft" (US-WUN-03) and "Verwerfen" (US-WUN-05) on a candidate: the answer of the server says what happened and what
 * comes next (P-09, P-10).
 */
export function useCandidateWrite(
  api: string,
  token: Token,
  onWritten: () => void,
  onRun: () => void,
) {
  const write = useWriteAction(token, onWritten);
  const [done, setDone] = useState<Outcome | null>(null);
  const run = (
    c: Candidate,
    send: (t: string, opts: WriteOptions) => Promise<Response<{ hint: Hint }>>,
    toPlant: boolean,
    action: string,
  ) => {
    onRun();
    void write.run(
      async (t, o) => {
        const r = await send(t, o);
        setDone(
          r.ok
            ? {
                hint: r.value.hint,
                toPlant: toPlant ? { id: c.id, name: c.name, title: c.title } : null,
              }
            : null,
        );
        return r;
      },
      "",
      entityKey("wish", c.id, action),
    );
  };
  return {
    buy: (c: Candidate) => run(c, (t, o) => buyWish(api, t, c.id, o), true, "buy"),
    discard: (c: Candidate) => run(c, (t, o) => discardWish(api, t, c.id, o), false, "discard"),
    storeImage: (c: Candidate) => {
      onRun();
      const send: Parameters<typeof write.run>[0] = async (t, o) => {
        const r = await storeWishImage(api, t, c.id, o);
        setDone(
          r.ok
            ? {
                hint: {
                  text: `Das Bild von „${c.title}“ ist bei dir gespeichert. Quelle und Lizenz stehen am Bild.`,
                  nextAction:
                    "Entscheide jetzt: Gekauft oder Verwerfen, oder schau dir die nächste Karte an.",
                },
                toPlant: null,
              }
            : null,
        );
        return r;
      };
      void write.run(send, "", entityKey("wish", c.id, "image"));
    },
    done,
    running: write.running,
    error: write.error,
  };
}

/** The confirmation takes the focus, so a keeper who tapped far down the list sees what happened (P-10). */

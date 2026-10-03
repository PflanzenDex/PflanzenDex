import { useState } from "react";
import type { Art } from "@pflanzendex/core";
import { BestandSeite } from "./bestand";
import { MessenSeite } from "./pflege";

type Token = () => Promise<string | undefined>;

/**
 * Der Bereich „Bestand“: Liste und Anlegen aus `bestand`, Messen aus `pflege`. Die App verdrahtet beide Module (sie
 * kennen sich nicht); das Exemplar, das gerade gemessen wird, merkt sich dieser Bereich (US-WAC-01).
 */
export function BestandBereich(props: {
  api: string;
  token: Token;
  neueArt: Art | null;
  onArtWaehlen: () => void;
  onAbgeschlossen: () => void;
}) {
  const [messen, setMessen] = useState<{ id: string; name: string } | null>(null);
  return messen ? (
    <MessenSeite
      api={props.api}
      token={props.token}
      exemplar={messen}
      onZurueck={() => setMessen(null)}
    />
  ) : (
    <BestandSeite {...props} onMessen={setMessen} />
  );
}

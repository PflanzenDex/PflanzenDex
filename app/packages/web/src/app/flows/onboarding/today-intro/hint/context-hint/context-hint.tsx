import { Suspense, useEffect, useState, type ReactNode } from "react";
import { isNoteOccasion, loadHints, type NoteOccasion } from "../hint-api";
import { HintNote } from "..";

type Token = () => Promise<string | undefined>;

/** The note of one occasion for its place: the note while the server picks that occasion, else nothing. */
type Note = (occasion: string) => ReactNode;

/**
 * The calm hint of a view with places of its own (US-ONB-07, the plant layer): one request asks the server which of the
 * applicable occasions is due, and `children` gets the note of each occasion for its place, so only the due one shows,
 * where it helps. The content renders at once; the note's code loads on its own (DS-08). It never blocks, and a failed
 * request fails open: no note shows, the view keeps its content (P-10).
 */
export function ContextHint(props: {
  api: string;
  token: Token;
  applicable: readonly string[];
  children: (note: Note) => ReactNode;
}) {
  const { api, token, applicable } = props;
  const key = applicable.join(",");
  const [picked, setPicked] = useState<NoteOccasion | null>(null);
  useEffect(() => {
    if (key === "") return;
    const asked = key.split(",");
    let current = true;
    void (async () => {
      const t = await token();
      const r = t ? await loadHints(api, t, asked) : null;
      const hint = r?.ok ? r.value.hint : null;
      if (current) setPicked(isNoteOccasion(hint) && asked.includes(hint) ? hint : null);
    })();
    return () => {
      current = false;
    };
  }, [api, token, key]);
  // The picked occasion counts only while the view still lists it: a write may have ended it meanwhile.
  const due = picked !== null && applicable.includes(picked) ? picked : null;
  const note: Note = (occasion) => {
    if (due === null || due !== occasion) return null;
    return (
      <Suspense fallback={null}>
        <HintNote occasion={due} api={api} token={token} onGone={() => setPicked(null)} />
      </Suspense>
    );
  };
  return <>{props.children(note)}</>;
}

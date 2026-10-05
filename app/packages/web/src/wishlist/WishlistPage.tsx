import "./wishlist.css";
import { useCallback, useState } from "react";
import type { CandidateList } from "@pflanzendex/core";
import { LoadFrame, useWriteAction } from "../kernel";
import { CandidateCard } from "./candidate-card";
import { WishForm } from "./wish-form";
import { createWish, loadCandidates, type WishInput } from "./wishlist-api";

type Token = () => Promise<string | undefined>;

/** The list with what to do next, and below it the form to record a wish; a write reloads the list (P-10). */
function Body(props: { list: CandidateList; api: string; token: Token; onWritten: () => void }) {
  const { list, api, token } = props;
  const write = useWriteAction(token, props.onWritten);
  const send = async (input: WishInput): Promise<boolean> => {
    let saved = false;
    await write.run(async (t) => {
      const r = await createWish(api, t, input);
      saved = r.ok;
      return r;
    }, `Wunsch „${input.name}“ gespeichert.`);
    return saved;
  };
  return (
    <>
      <div className="hint candidate-hint">
        <p>{list.hint.text}</p>
        <p className="next-action">{list.hint.nextAction}</p>
      </div>
      {list.candidates.length > 0 && (
        <ul className="wish-grid" aria-label="Offene Kandidaten">
          {list.candidates.map((c, i) => (
            <CandidateCard key={c.id} c={c} rank={i + 1} />
          ))}
        </ul>
      )}
      <WishForm
        zones={list.zones}
        running={write.running}
        message={write.message}
        error={write.error}
        onSend={send}
      />
    </>
  );
}

/**
 * The wishlist (US-WUN-01): the open candidates sorted by the stock of their target light zone, thinnest first, each
 * with the reason for its place; below it the form to record a wish.
 */
export function WishlistPage(props: { api: string; token: Token }) {
  const { api, token } = props;
  const [version, setVersion] = useState(0);
  const load = useCallback((t: string) => loadCandidates(api, t), [api]);
  const reload = useCallback(() => setVersion((n) => n + 1), []);
  return (
    <div className="light wishlist-page">
      <section aria-labelledby="wishlist-title">
        <h1 id="wishlist-title">Wunschliste</h1>
        <p className="quiet">
          Deine offenen Wünsche, geordnet nach Platz: oben steht, was in die Zone mit den wenigsten
          Pflanzen kommt.
        </p>
        <LoadFrame
          token={token}
          load={load}
          refresh={version}
          loadingText="Wunschliste wird geladen …"
        >
          {(list: CandidateList) => <Body list={list} api={api} token={token} onWritten={reload} />}
        </LoadFrame>
      </section>
    </div>
  );
}

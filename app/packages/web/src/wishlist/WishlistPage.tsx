import { useCallback } from "react";
import type { CandidateList } from "@pflanzendex/core";
import { LoadFrame, useInvalidate, useWriteAction } from "../kernel";
import { EmptyState } from "@/components/shared/empty-state";
import { CandidateCard } from "./candidate-card";
import { WishForm } from "./wish-form";
import { WishlistPageSkeleton } from "./WishlistPage.skeleton";
import { createWish, loadCandidates, type WishInput } from "./wishlist-api";

/** Next action of an empty list: take the keeper to the form below. */
const focusForm = () =>
  document
    .querySelector<HTMLElement>('section[aria-labelledby="wish-form-title"] input[name="name"]')
    ?.focus();

const KEY = ["wishlist", "candidates"] as const;
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
    <div className="flex min-w-0 flex-col gap-4">
      {list.candidates.length === 0 ? (
        <EmptyState
          title={list.hint.text}
          description={list.hint.nextAction}
          action={{ label: "Wunsch erfassen", onClick: focusForm }}
        />
      ) : (
        <div className="rounded-lg border border-border p-3">
          <p>{list.hint.text}</p>
          <p className="mt-1 font-semibold">{list.hint.nextAction}</p>
        </div>
      )}
      {list.candidates.length > 0 && (
        <ul
          className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Offene Kandidaten"
        >
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
    </div>
  );
}

/**
 * The wishlist (US-WUN-01): the open candidates sorted by the stock of their target light zone, thinnest first, each
 * with the reason for its place; below it the form to record a wish.
 */
export function WishlistPage(props: { api: string; token: Token }) {
  const { api, token } = props;
  const reload = useInvalidate(KEY);
  const load = useCallback((t: string) => loadCandidates(api, t), [api]);
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-6 text-card-foreground md:p-7">
      <section aria-labelledby="wishlist-title" className="flex min-w-0 flex-col gap-3">
        <h1 id="wishlist-title" className="text-2xl font-semibold">
          Wunschliste
        </h1>
        <p className="text-muted-foreground">
          Deine offenen Wünsche, geordnet nach Platz: oben steht, was in die Zone mit den wenigsten
          Pflanzen kommt.
        </p>
        <LoadFrame
          queryKey={KEY}
          token={token}
          load={load}
          loadingText="Wunschliste wird geladen …"
          loadingFallback={<WishlistPageSkeleton label="Wunschliste wird geladen …" />}
        >
          {(list: CandidateList) => <Body list={list} api={api} token={token} onWritten={reload} />}
        </LoadFrame>
      </section>
    </div>
  );
}

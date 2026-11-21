import { Suspense, type ReactNode } from "react";
import {
  SCREEN_STALE_TIME,
  requestQueryFn,
  useQueryClient,
  useRequest,
  type QueryClient,
} from "@/shared/data";
import {
  hintsKey,
  isNoteOccasion,
  loadHints,
  type HintState,
  type NoteOccasion,
} from "../hint-api";
import { HintNote } from "..";

type Token = () => Promise<string | undefined>;

/**
 * How long the answer of a prefetch stays in the cache when nobody reads it (starting value, assumption: 30 minutes). The
 * default of the data layer is 5 minutes, and a prefetch has no reader until a layer opens, so a keeper who stays on the
 * plants screen longer would meet the note arriving late again (issue 2384).
 */
const KEEP_TIME = 30 * 60_000;

/** The note of one occasion for its place: the note while the server picks that occasion, else nothing. */
type Note = (occasion: string) => ReactNode;

/**
 * Asks for the hint before its view opens (US-QS-23, issue 2384): the plants screen calls it when it shows, so the plant
 * layer that opens later finds the answer in the data layer, under the key `ContextHint` reads, and its first render
 * already holds the note, so the layer does not grow when the note arrives. A note that is due has its chunk loaded too
 * (`HintNote` renders at once with its chunk in hand). Nothing is asked for no occasion; a failure leaves the cache empty,
 * so the layer asks itself, and nothing here throws (P-10: the view fails open, as without a prefetch).
 */
export async function prefetchHints(
  client: QueryClient,
  api: string,
  token: Token,
  applicable: readonly string[],
): Promise<void> {
  if (applicable.length === 0) return;
  const queryKey = hintsKey(applicable);
  await client.prefetchQuery({
    queryKey,
    staleTime: SCREEN_STALE_TIME,
    gcTime: KEEP_TIME,
    queryFn: requestQueryFn(token, (accessToken) => loadHints(api, accessToken, applicable)),
  });
  const hint = client.getQueryData<HintState>(queryKey)?.hint;
  if (isNoteOccasion(hint) && applicable.includes(hint))
    await HintNote.load().catch(() => undefined);
}

/**
 * The calm hint of a view with places of its own (US-ONB-07, the plant layer): one request asks the server which of the
 * applicable occasions is due, and `children` gets the note of each occasion for its place, so only the due one shows,
 * where it helps. The answer comes through the data layer, so a copy that `prefetchHints` fetched a moment earlier shows
 * at once; the content renders at once, and the note's code loads on its own (DS-08). It never blocks, and a failed
 * request fails open: no note shows, the view keeps its content (P-10). A dismissal updates the copy, so the note does not
 * return when the view opens again.
 */
export function ContextHint(props: {
  api: string;
  token: Token;
  applicable: readonly string[];
  children: (note: Note) => ReactNode;
}) {
  const { api, token, applicable } = props;
  const client = useQueryClient();
  const queryKey = hintsKey(applicable);
  const hints = useRequest<HintState>({
    queryKey,
    token,
    load: (accessToken) => loadHints(api, accessToken, applicable),
    enabled: applicable.length > 0,
    staleTime: SCREEN_STALE_TIME,
  });
  // The picked occasion counts only while the view still lists it: a write may have ended it meanwhile.
  const hint = hints.value?.hint;
  const due: NoteOccasion | null = isNoteOccasion(hint) && applicable.includes(hint) ? hint : null;
  const note: Note = (occasion) => {
    if (due === null || due !== occasion) return null;
    // A request that is on its way would restore the dismissed note when it answers: it is cancelled first.
    const gone = async () => {
      await client.cancelQueries({ queryKey });
      client.setQueryData<HintState>(queryKey, (old) => old && { ...old, hint: null });
    };
    return (
      <Suspense fallback={null}>
        <HintNote occasion={due} api={api} token={token} onGone={() => void gone()} />
      </Suspense>
    );
  };
  return <>{props.children(note)}</>;
}

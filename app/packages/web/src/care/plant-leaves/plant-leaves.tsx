import { useCallback, useMemo, useState } from "react";
import { NetworkSlot } from "@/shared/ui/button.network-gate";
import {
  localToday,
  type LeafDirection,
  type LeafLogView,
  type LeafMeasure,
  type LeafRow as Leaf,
} from "@pflanzendex/core";
import {
  appendKey,
  entityKey,
  SIGN_IN,
  currentTimeZone,
  useFeature,
  useInvalidate,
  type ApiError,
  type KeyScope,
  type Response,
  useRepeatKey,
  withConflictDismiss,
  type WriteOptions,
} from "@/shared/data";
import { LoadFrame } from "@/shared/patterns/states/request-state/load-frame/load-frame";
import { Button } from "@/shared/ui/button";
import { EmptySection } from "@/shared/patterns/elements/empty-state/empty-section/empty-section";
import { Pager } from "@/shared/patterns/responsive/pager/pager";
import { ResponsiveModal } from "@/shared/patterns/responsive/responsive-modal/responsive-modal";
import { texts } from "@/shared/lib/text-rules/texts";
import { RefusalAlert } from "../shared/notices/notices";
import { loadLeafLog, recordLeaf, removeLeaf, type LeafInput } from "./leaves-api";
import { LeafForm } from "./leaf-form/leaf-form";
import { LeafRow } from "./leaf-row/leaf-row";
import table from "./plant-leaves.de.json";
import { LeafLogSkeleton } from "./plant-leaves.skeleton";

const t = texts(table);
/**
 * Leaves per page (starting value, assumption): one whole entry. The leaf log sits in the tab "Verlauf" under its switch,
 * count, comparison and buttons, and two entries overflowed a 360 x 640 phone (one-screen gate, issue 1589). `fit` cannot
 * size the list to its free height here: the containers between the layer and this list are sized by their content.
 */
const PAGE_SIZE = 1;

type Token = () => Promise<string | undefined>;
type Props = { api: string; token: Token; specimenId: string };

/** The German sentence of a comparison, by measure and direction (US-WAC-07); the keys live in the message table. */
const COMPARISON: Record<LeafMeasure, Record<LeafDirection, keyof typeof table>> = {
  length: {
    larger: "comparison.length.larger",
    smaller: "comparison.length.smaller",
    same: "comparison.length.same",
  },
  width: {
    larger: "comparison.width.larger",
    smaller: "comparison.width.smaller",
    same: "comparison.width.same",
  },
};

const countText = (n: number): string => (n === 1 ? t("countOne") : t("count", { n }));

/**
 * Sends one leaf write with a sign-in check; the caller gets the refusal (P-10), a success refreshes the list. `clear` is
 * how the caller removes its notice: a key conflict of a new leaf comes back with `dismiss`, which frees the key and
 * calls it (US-QS-03).
 */
function useLeafWrites(api: string, token: Token, specimenId: string, onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const keys = useRepeatKey();
  const run = useCallback(
    async (
      write: (
        access: { api: string; token: string },
        opts: WriteOptions,
      ) => Promise<Response<unknown>>,
      scope: KeyScope,
      clear: () => void,
    ) => {
      const current = await token();
      if (!current) return SIGN_IN;
      setBusy(true);
      const r = await keys.run((key) => write({ api, token: current }, { key }), scope);
      setBusy(false);
      if (r.ok) onDone();
      return r.ok ? null : withConflictDismiss(r.error, scope, clear);
    },
    [api, token, onDone, keys],
  );
  return {
    busy,
    // An append (a leaf is added to the plant): the operation only, the leaf's input is the body (US-QS-03).
    send: (input: LeafInput, clear: () => void): Promise<ApiError | null> =>
      run(
        (access, opts) => recordLeaf(access, specimenId, input, opts),
        appendKey("specimen", specimenId, "leaf:record"),
        clear,
      ),
    remove: (leafId: string, clear: () => void): Promise<ApiError | null> =>
      run(
        (access, opts) => removeLeaf(access, specimenId, leafId, opts),
        entityKey("specimen", specimenId, `remove:${leafId}`),
        clear,
      ),
  };
}

function LeafList(props: { view: LeafLogView; busy: boolean; onRemove: (row: Leaf) => void }) {
  const { view } = props;
  // One line only: "Neues Blatt" and "Mit Details" stand right above, so the line repeats neither (SG-STATE-01, issue 2233).
  if (view.count === 0) return <EmptySection text={t("empty.line")} />;
  return (
    <div className="grid gap-3">
      <p className="font-semibold">{countText(view.count)}</p>
      {view.comparison ? (
        <p>{t(COMPARISON[view.comparison.measure][view.comparison.direction])}</p>
      ) : null}
      <Pager
        items={view.leaves}
        pageSize={PAGE_SIZE}
        label={t("list")}
        param="blfrom"
        getKey={(leaf) => leaf.id}
        renderItem={(leaf) => <LeafRow row={leaf} busy={props.busy} onRemove={props.onRemove} />}
      />
    </div>
  );
}

/**
 * "Neue Blätter" in the tab "Verlauf" of a plant (US-WAC-07): the count, the comparison of the newest leaf, the last
 * leaves newest first in pages, a quick "Neues Blatt" with today's date, and the details (date, sizes, note) in a form.
 * Without leaves it says what to do next (P-09). With the keeper switch off nothing shows at all (P-12).
 */
export function PlantLeaves(props: Props) {
  const on = useFeature("leaf_log");
  if (!on) return null;
  return <LeafLog {...props} />;
}

function LeafLog({ api, token, specimenId }: Props) {
  const key = useMemo(() => ["care", "leaves", specimenId], [specimenId]);
  const invalidate = useInvalidate(key);
  const writes = useLeafWrites(api, token, specimenId, invalidate);
  const [refusal, setRefusal] = useState<ApiError | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const load = useCallback(
    (current: string) => loadLeafLog(api, current, specimenId),
    [api, specimenId],
  );
  const today = localToday(new Date(), currentTimeZone());
  const clear = () => setRefusal(null);
  const quick = async () => setRefusal(await writes.send({}, clear));
  const remove = async (row: Leaf) => setRefusal(await writes.remove(row.id, clear));
  const drop = (row: Leaf) => void remove(row);
  return (
    <section aria-labelledby="leaf-heading" className="grid gap-3">
      <h3 id="leaf-heading" className="sr-only">
        {t("heading")}
      </h3>
      {/* Two equal columns, both 48 px high, no wrap at 360 px (US-WAC-07); neither is filled: the layer has one filled action (US-QS-15). */}
      <NetworkSlot>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="tinted"
            size="touch"
            disabled={writes.busy}
            needsNetwork
            onClick={() => void quick()}
          >
            {t("newLeaf")}
          </Button>
          <Button type="button" variant="tinted" size="touch" onClick={() => setFormOpen(true)}>
            {t("withDetails")}
          </Button>
        </div>
      </NetworkSlot>
      {refusal && <RefusalAlert error={refusal} />}
      <LoadFrame
        queryKey={key}
        token={token}
        load={load}
        loadingText={t("loading")}
        loadingFallback={<LeafLogSkeleton label={t("loading")} />}
      >
        {(view) => <LeafList view={view} busy={writes.busy} onRemove={drop} />}
      </LoadFrame>
      <ResponsiveModal
        title={t("form.title")}
        closeLabel={t("form.close")}
        open={formOpen}
        onOpenChange={setFormOpen}
      >
        <LeafForm today={today} onSend={writes.send} onSaved={() => setFormOpen(false)} />
      </ResponsiveModal>
    </section>
  );
}

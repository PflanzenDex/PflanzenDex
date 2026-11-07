import { useCallback, useMemo, useState } from "react";
import {
  localToday,
  type LeafDirection,
  type LeafLogView,
  type LeafMeasure,
  type LeafRow as Leaf,
} from "@pflanzendex/core";
import {
  LoadFrame,
  SIGN_IN,
  currentTimeZone,
  useFeature,
  useInvalidate,
  type ApiError,
  type Response,
} from "@/shared/data";
import { Button } from "@/shared/ui/button/button";
import { Pager } from "@/shared/patterns/responsive/pager/pager";
import { ResponsiveModal } from "@/shared/patterns/responsive/responsive-modal/responsive-modal";
import { texts } from "@/shared/lib/text-rules/texts";
import { RefusalAlert } from "../shared/notices/notices";
import { loadLeafLog, recordLeaf, removeLeaf, type LeafInput } from "./leaves-api";
import { LeafForm } from "./leaf-form/leaf-form";
import { LeafRow } from "./leaf-row/leaf-row";
import table from "./plant-leaves.de.json";

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

/** Sends one leaf write with a sign-in check; the caller gets the refusal (P-10), a success refreshes the list. */
function useLeafWrites(api: string, token: Token, specimenId: string, onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (write: (access: { api: string; token: string }) => Promise<Response<unknown>>) => {
      const current = await token();
      if (!current) return SIGN_IN;
      setBusy(true);
      const r = await write({ api, token: current });
      setBusy(false);
      if (r.ok) onDone();
      return r.ok ? null : r.error;
    },
    [api, token, onDone],
  );
  return {
    busy,
    send: (input: LeafInput): Promise<ApiError | null> =>
      run((access) => recordLeaf(access, specimenId, input)),
    remove: (leafId: string): Promise<ApiError | null> =>
      run((access) => removeLeaf(access, specimenId, leafId)),
  };
}

function LeafList(props: { view: LeafLogView; busy: boolean; onRemove: (row: Leaf) => void }) {
  const { view } = props;
  // Two plain lines, not the empty panel: the buttons above already are the next step (P-09), and the tab fits one screen.
  if (view.count === 0)
    return (
      <div className="grid gap-1">
        <p className="font-semibold">{t("empty.title")}</p>
        <p className="text-sm text-muted-foreground">{t("empty.description")}</p>
      </div>
    );
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
        replace
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
  const quick = async () => setRefusal(await writes.send({}));
  const remove = async (row: Leaf) => setRefusal(await writes.remove(row.id));
  return (
    <section aria-labelledby="leaf-heading" className="grid gap-3">
      <h3 id="leaf-heading" className="sr-only">
        {t("heading")}
      </h3>
      {/* Two equal columns: both buttons keep their 48 px height and do not wrap on a 360 px phone (US-WAC-07). */}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" size="touch" disabled={writes.busy} onClick={() => void quick()}>
          {t("newLeaf")}
        </Button>
        <Button type="button" variant="outline" size="touch" onClick={() => setFormOpen(true)}>
          {t("withDetails")}
        </Button>
      </div>
      {refusal && <RefusalAlert error={refusal} />}
      <LoadFrame queryKey={key} token={token} load={load} loadingText={t("loading")}>
        {(view) => <LeafList view={view} busy={writes.busy} onRemove={(row) => void remove(row)} />}
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

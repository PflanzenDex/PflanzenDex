import { useCallback, useState, type ReactNode } from "react";
import { EmptySection } from "@/shared/patterns/elements/empty-state/empty-section/empty-section";
import { Button } from "@/shared/ui/button/button";
import { Pager, type PagerPart } from "@/shared/patterns/responsive/pager/pager";
import { keepTogether } from "@/shared/lib/format";
import { Checkbox } from "@/shared/ui/fields/checkbox/checkbox";
import { texts } from "@/shared/lib/text-rules/texts";
import { useAnnounce } from "@/shared/platform/announcer/context";
import { LoadFrame, useInvalidate, useWriteAction } from "../../../shared/data";
import { DueCountOf, WATERING_KEY, type DueCount } from "../../api/due-count/due-count";
import { loadWateringDue, markWatered, type WateringDueRow } from "../../api/reminders-api";
import { WateringListSkeleton } from "./watering-list.skeleton";
import table from "./watering-list.de.json";

const ui = texts(table);

type Token = () => Promise<string | undefined>;
const KEY = WATERING_KEY;

/** Rows per page (starting value, assumption; US-QS-18). */
const PAGE_SIZE = 3;

const sinceText = (d: WateringDueRow) =>
  d.lastWateredOn === null
    ? ui("since.never")
    : keepTogether(ui("since.days", { days: d.daysSince }));

function Row(props: {
  row: WateringDueRow;
  checked: boolean;
  busy: boolean;
  onToggle: () => void;
  onWater: () => void;
}) {
  const r = props.row;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
      <Checkbox checked={props.checked} onChange={props.onToggle} rowClassName="min-w-0 flex-1">
        <span>
          <span className="font-medium">{r.name}</span>
          <span className="block text-sm tabular-nums text-muted-foreground">
            {sinceText(r)},{" "}
            {ui("interval", { days: keepTogether(ui("days", { count: r.intervalDays })) })}
          </span>
        </span>
      </Checkbox>
      <Button
        variant="outline"
        size="sm"
        disabled={props.busy}
        aria-label={ui("waterOne", { name: r.name })}
        onClick={props.onWater}
      >
        {ui("water")}
      </Button>
    </div>
  );
}

/**
 * The due rows with their marks and the one-step pick of several. The write belongs to `DueList`, which stays mounted
 * while the list is empty, so the result of the last write still shows then (F-0075, US-QS-32).
 */
function Rows(props: {
  rows: readonly WateringDueRow[];
  busy: boolean;
  water: (ids: readonly string[]) => void;
  param?: PagerPart;
}) {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setChosen((c) => {
      const next = new Set(c);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const water = (ids: readonly string[]) => {
    setChosen(new Set());
    props.water(ids);
  };
  const picked = props.rows.filter((r) => chosen.has(r.specimenId)).map((r) => r.specimenId);
  return (
    <div className="flex flex-col gap-3">
      <Pager
        items={props.rows}
        pageSize={PAGE_SIZE}
        {...(props.param ? { param: props.param } : {})}
        label={ui("pager")}
        getKey={(r) => r.specimenId}
        renderItem={(r) => (
          <Row
            row={r}
            checked={chosen.has(r.specimenId)}
            busy={props.busy}
            onToggle={() => toggle(r.specimenId)}
            onWater={() => water([r.specimenId])}
          />
        )}
      />
      {/* One mark is no bulk entry: the hint says how to get there, the button only shows from two marks (US-QS-32). */}
      {picked.length < 2 ? (
        <p className="m-0 text-sm text-muted-foreground">{ui("pickMore")}</p>
      ) : (
        <Button
          size="touch"
          className="self-start"
          disabled={props.busy}
          onClick={() => water(picked)}
        >
          {ui("pickedCount", { count: picked.length })}
        </Button>
      )}
    </div>
  );
}

/**
 * The plants that are due to be watered today (US-MON-05): last watering plus the interval of the current phase. The
 * intervals are the keeper's own entries in the care profile; without one a plant is not listed (nothing is invented,
 * P-08), and the empty state says where to set it (P-09). "Gegossen" writes today's entry; several can be marked and
 * entered in one step.
 */
export function WateringList(props: {
  api: string;
  token: Token;
  /** With `count` the list renders nothing of its own and hands the due count to it (US-QS-18). */
  count?: (due: DueCount) => ReactNode;
  /**
   * The address part of its pages: a list in a layer passes `LAYER_PARAM`, so it does not share `from` with the screen
   * behind it (US-QS-18, issue 2070). Alone on its screen it keeps the default.
   */
  param?: PagerPart;
}) {
  if (props.count)
    return (
      <DueCountOf api={props.api} token={props.token}>
        {props.count}
      </DueCountOf>
    );
  return (
    <DueList api={props.api} token={props.token} {...(props.param ? { param: props.param } : {})} />
  );
}

/**
 * The list with its write. The result of "Gegossen" is a line of reserved height above the list (F-0075, SG-FEED-01): it
 * stays when the last plant is marked and the list shows its empty state, and the announcer says the same text once (the
 * line carries no role). A refusal is the alert below the list (P-10, SG-FEED-02).
 */
function DueList(props: { api: string; token: Token; param?: PagerPart }) {
  const load = useCallback((t: string) => loadWateringDue(props.api, t), [props.api]);
  const again = useInvalidate(KEY);
  const announce = useAnnounce();
  const [result, setResult] = useState<string | null>(null);
  // A refusal is not said here: it is the alert below. Only a success is the result line and the announcement.
  const write = useWriteAction(props.token, again, (message, kind) => {
    if (kind === "error") return;
    setResult(message);
    announce?.announce(message);
  });
  const water = (ids: readonly string[]) => {
    setResult(null);
    void write.run((t) => markWatered(props.api, t, ids), ui("done"));
  };
  return (
    // No gap around the reserved line: it costs one text line and nothing more, so the sheet still fits (QG-U8).
    <div className="flex flex-col">
      <p className="min-h-[1lh] text-sm">{result}</p>
      <LoadFrame
        queryKey={KEY}
        token={props.token}
        load={load}
        loadingText={ui("loading")}
        loadingFallback={<WateringListSkeleton label={ui("loading")} />}
      >
        {(rows) =>
          rows.length === 0 ? (
            <EmptySection text={ui("none.line")} />
          ) : (
            <Rows
              rows={rows}
              busy={write.running}
              water={water}
              {...(props.param ? { param: props.param } : {})}
            />
          )
        }
      </LoadFrame>
      {write.error && (
        <p role="alert" className="mt-3 rounded-lg border border-destructive p-3">
          {write.error.text}
        </p>
      )}
    </div>
  );
}

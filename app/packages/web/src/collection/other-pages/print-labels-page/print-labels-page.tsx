// The page that prints the QR pot labels (US-BES-17, FR-BES-25): the keeper chooses plants and a format, "Etiketten drucken" opens
// the print dialog. The labels live in a print-only region in the body; the rest of the app is hidden in print.
import { useState } from "react";
import { Navigate } from "react-router";
import type { SpecimenCard } from "@pflanzendex/core";
import { EmptyState } from "@/shared/patterns/elements/empty-state/empty-state";
import { FullView } from "@/shared/patterns/navigation/full-view/full-view";
import { ADD_PLANT_PATH, PATHS } from "@/shared/patterns/navigation/navigation/navigation";
import { Pager, type PagerPaging } from "@/shared/patterns/responsive/pager/pager";
import { useRowPageSize } from "@/shared/patterns/responsive/pager/row-page-size";
import { RequestState } from "@/shared/patterns/states/request-state/request-state";
import { SegmentedControl } from "@/shared/patterns/elements/segmented-control/segmented-control";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { errorText } from "@/shared/lib/error-text";
import { plurals, texts } from "@/shared/lib/text-rules/texts";
import { useFeature } from "@/shared/data";
import { useCardPages, type CardPages } from "../../specimens/cards/use-card-pages";
import { PrintRegion, type LabelFormat, type LabelPlant } from "./label-sheet/label-sheet";
import { useLabelFormatChoice, type LabelFormatProps } from "./label-sheet/label-sheet";
import { useLabelCultivars, type LabelCultivars } from "./use-label-cultivars";
import table from "./print-labels-page.de.json";
import { PrintLabelsSkeleton } from "./print-labels-page.skeleton";

type Token = () => Promise<string | undefined>;
const ui = texts(table);
const plural = plurals(table);

/** The server paging of the plant list for the Pager (FR-BES-23): the total, the loading state and a failure's text. */
function pagingOf(list: CardPages): PagerPaging {
  return {
    total: list.total ?? 0,
    loading: list.status === "pending" || list.loadingMore,
    ...(list.error === undefined ? {} : { failure: list.error.text || ui("failed") }),
    onMore: list.loadMore,
    onRetry: list.retry,
    loadingText: ui("loadingMore"),
    retryText: ui("retry"),
  };
}

/** What the next step is (P-09): the missing plant, or the print once everything is ready (the format is always chosen). */
function nextStep(chosen: number, preparing: boolean): string {
  if (chosen === 0) return ui("noPlant");
  if (preparing) return ui("preparing");
  return ui("ready");
}

/**
 * The print page of the keeper's plants. The switch "pot_labels" off sends the address to the collection (P-12). The
 * format starts with `format` and each choice is passed to `onFormat`: the route gives both (US-QS-32).
 */
export function PrintLabelsPage(props: { api: string; token: Token } & Partial<LabelFormatProps>) {
  const on = useFeature("pot_labels");
  if (!on) return <Navigate to={PATHS.collection} replace />;
  return <LabelsView {...props} format={props.format ?? "sheet"} />;
}

function LabelsView(props: { api: string; token: Token } & LabelFormatProps) {
  const { api, token } = props;
  const list = useCardPages(api, token);
  const rows = useRowPageSize();
  // The chosen plants are kept as cards: the choice survives a reload of the list and the printed plant stays exact.
  const [chosen, setChosen] = useState<SpecimenCard[]>([]);
  const [format, chooseFormat] = useLabelFormatChoice(props);
  const speciesIds = chosen.map((c) => c.speciesId);
  const cultivars = useLabelCultivars(api, token, speciesIds);
  const plants: LabelPlant[] = chosen.map((c) => ({
    id: c.id,
    name: c.name,
    cultivar: cultivars.cultivarOf(c.speciesId),
  }));
  const toggle = (card: SpecimenCard) =>
    setChosen((cur) =>
      cur.some((c) => c.id === card.id) ? cur.filter((c) => c.id !== card.id) : [...cur, card],
    );
  const status = list.status === "ready" && list.cards.length === 0 ? "empty" : list.status;

  return (
    // One screen (US-QS-15, DS-61): the frame fills the free height, and the list pages by what is left of it (issue 1413).
    <div data-fit-screen="" data-fit-fill="" className="flex min-h-0 min-w-0 flex-col">
      <FullView
        headingId="print-labels-title"
        title={ui("heading")}
        back={{ label: ui("back"), to: PATHS.collection }}
      >
        <RequestState
          status={status}
          {...(list.error ? { errorText: errorText(list.error.code) } : {})}
          onRetry={list.retry}
          skeleton={<PrintLabelsSkeleton label={ui("loading")} />}
          empty={
            <EmptyState
              title={ui("emptyTitle")}
              description={ui("emptyText")}
              action={{ label: ui("addPlant"), href: ADD_PLANT_PATH }}
            />
          }
        >
          <ChoicePanel
            list={list}
            rows={rows}
            chosen={chosen}
            onToggle={toggle}
            format={format}
            onFormat={chooseFormat}
            cultivars={cultivars}
          />
        </RequestState>
        {chosen.length > 0 ? (
          <PrintRegion label={ui("printRegion")} plants={plants} format={format} />
        ) : null}
      </FullView>
    </div>
  );
}

/** The choice: the format, the plants in pages with a checkbox each, and the print button with the next step (P-09). */
function ChoicePanel(props: {
  list: CardPages;
  rows: number;
  chosen: readonly SpecimenCard[];
  onToggle: (card: SpecimenCard) => void;
  format: LabelFormat;
  onFormat: (format: LabelFormat) => void;
  cultivars: LabelCultivars;
}) {
  const { list, rows, chosen, onToggle, format, onFormat, cultivars } = props;
  const ready = chosen.length > 0 && cultivars.status === "ready";
  return (
    // min-h-0: the list takes the free height and scrolls in its box, the print button stays below it; at a larger text size
    // the list keeps its minimum and the frame scrolls (issue 1113).
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <p className="text-sm text-muted-foreground">{ui("intro")}</p>
      <div className="flex flex-col gap-1">
        <p className="font-semibold">{ui("format")}</p>
        <SegmentedControl
          label={ui("format")}
          options={[
            { value: "sheet", label: ui("formatSheet") },
            { value: "single", label: ui("formatSingle") },
          ]}
          value={format}
          onChange={onFormat}
        />
      </div>
      <Pager
        items={list.cards}
        pageSize={rows}
        fit
        label={ui("list")}
        getKey={(card) => card.id}
        paging={pagingOf(list)}
        renderItem={(card) => (
          <Checkbox
            checked={chosen.some((c) => c.id === card.id)}
            onChange={() => onToggle(card)}
            // The text breaks inside the row: at 200 % text a long name or place would widen the list sideways (SG-LIST-01).
            rowClassName="min-w-0 flex-1 [&>span]:min-w-0 [&>span]:break-words"
          >
            {card.name}
            <span className="block text-sm text-muted-foreground">
              {card.location ?? ui("unknownLocation")}
            </span>
          </Checkbox>
        )}
      />
      <PrintAction
        ready={ready}
        count={chosen.length}
        unreadable={cultivars.unreadable}
        hint={nextStep(chosen.length, cultivars.status === "pending")}
      />
    </div>
  );
}

/** Printing opens the print dialog once everything is chosen; its label counts the labels (US-QS-32); the hint says what is missing (P-09, P-10). */
function PrintAction(props: { ready: boolean; unreadable: boolean; count: number; hint: string }) {
  return (
    <div className="flex flex-col gap-2">
      {props.unreadable ? (
        <p role="status" className="text-sm">
          {ui("unreadable")}
        </p>
      ) : null}
      <Button
        type="button"
        disabled={!props.ready}
        aria-describedby="print-labels-hint"
        onClick={() => window.print()}
      >
        {props.count === 0 ? ui("print") : plural.counted("printCount", props.count)}
      </Button>
      <p id="print-labels-hint" className="text-sm text-muted-foreground">
        {props.hint}
      </p>
    </div>
  );
}

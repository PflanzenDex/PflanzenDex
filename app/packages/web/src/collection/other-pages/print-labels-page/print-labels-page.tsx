// The page that prints the QR pot labels (US-BES-17, FR-BES-25): the keeper chooses plants and a format, "Drucken" opens
// the print dialog. The labels live in a print-only region in the body; the rest of the app is hidden in print.
import { useState } from "react";
import { Navigate } from "react-router";
import type { SpecimenCard } from "@pflanzendex/core";
import { EmptyState } from "@/shared/patterns/elements/empty-state/empty-state";
import { FullView } from "@/shared/patterns/navigation/full-view/full-view";
import { PATHS } from "@/shared/patterns/navigation/navigation/navigation";
import { Pager, type PagerPaging } from "@/shared/patterns/responsive/pager/pager";
import { useRowPageSize } from "@/shared/patterns/responsive/pager/row-page-size";
import { RequestState } from "@/shared/patterns/states/request-state/request-state";
import { Button } from "@/shared/ui/button/button";
import { Label } from "@/shared/ui/display/label/label";
import { Checkbox } from "@/shared/ui/fields/checkbox/checkbox";
import { Select } from "@/shared/ui/fields/select/select";
import { errorText } from "@/shared/lib/error-text";
import { texts } from "@/shared/lib/text-rules/texts";
import { useFeature } from "@/shared/data";
import { useCardPages, type CardPages } from "../../specimens/cards/use-card-pages";
import { PrintRegion, type LabelFormat, type LabelPlant } from "./label-sheet/label-sheet";
import { useLabelCultivars, type LabelCultivars } from "./use-label-cultivars";
import table from "./print-labels-page.de.json";

type Token = () => Promise<string | undefined>;
const ui = texts(table);

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

/** What the next step is (P-09): the missing choice, or the print once everything is ready. */
function nextStep(chosen: number, format: LabelFormat | "", preparing: boolean): string {
  if (chosen === 0) return ui("noPlant");
  if (format === "") return ui("noFormat");
  if (preparing) return ui("preparing");
  return ui("ready");
}

/** The print page of the keeper's plants. The switch "pot_labels" off sends the address to the collection (P-12). */
export function PrintLabelsPage(props: { api: string; token: Token }) {
  const on = useFeature("pot_labels");
  if (!on) return <Navigate to={PATHS.collection} replace />;
  return <LabelsView api={props.api} token={props.token} />;
}

function LabelsView(props: { api: string; token: Token }) {
  const { api, token } = props;
  const list = useCardPages(api, token);
  const rows = useRowPageSize();
  // The chosen plants are kept as cards: the choice survives a reload of the list and the printed plant stays exact.
  const [chosen, setChosen] = useState<SpecimenCard[]>([]);
  const [format, setFormat] = useState<LabelFormat | "">("");
  const cultivars = useLabelCultivars(
    api,
    token,
    chosen.map((c) => c.speciesId),
  );
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
    // One screen (US-QS-15, DS-61): the page does not scroll, the content region does at a large text size.
    <div data-fit-screen="" className="flex min-w-0 flex-col">
      <FullView
        headingId="print-labels-title"
        title={ui("heading")}
        back={{ label: ui("back"), to: PATHS.collection }}
      >
        <RequestState
          status={status}
          {...(list.error ? { errorText: errorText(list.error.code) } : {})}
          onRetry={list.retry}
          empty={
            <EmptyState
              title={ui("emptyTitle")}
              description={ui("emptyText")}
              action={{ label: ui("toCollection"), href: PATHS.collection }}
            />
          }
        >
          <ChoicePanel
            list={list}
            rows={rows}
            chosen={chosen}
            onToggle={toggle}
            format={format}
            onFormat={setFormat}
            cultivars={cultivars}
          />
        </RequestState>
        {chosen.length > 0 && format !== "" ? (
          <PrintRegion label={ui("printRegion")} plants={plants} format={format} />
        ) : null}
      </FullView>
    </div>
  );
}

/** The choice: the format, the plants in pages with a checkbox each, and "Drucken" with the next step (P-09). */
function ChoicePanel(props: {
  list: CardPages;
  rows: number;
  chosen: readonly SpecimenCard[];
  onToggle: (card: SpecimenCard) => void;
  format: LabelFormat | "";
  onFormat: (format: LabelFormat | "") => void;
  cultivars: LabelCultivars;
}) {
  const { list, rows, chosen, onToggle, format, cultivars } = props;
  const ready = chosen.length > 0 && format !== "" && cultivars.status === "ready";
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <p className="text-sm text-muted-foreground">{ui("intro")}</p>
      <div className="flex flex-col gap-1">
        <Label htmlFor="print-labels-format">{ui("format")}</Label>
        <Select
          id="print-labels-format"
          value={format}
          onChange={(e) => props.onFormat(e.target.value as LabelFormat | "")}
        >
          <option value="">{ui("formatNone")}</option>
          <option value="sheet">{ui("formatSheet")}</option>
          <option value="single">{ui("formatSingle")}</option>
        </Select>
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
            rowClassName="min-w-0 flex-1"
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
        unreadable={cultivars.unreadable}
        hint={nextStep(chosen.length, format, cultivars.status === "pending")}
      />
    </div>
  );
}

/** "Drucken" opens the print dialog once everything is chosen; the hint says what is missing (P-09, P-10). */
function PrintAction(props: { ready: boolean; unreadable: boolean; hint: string }) {
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
        {ui("print")}
      </Button>
      <p id="print-labels-hint" className="text-sm text-muted-foreground">
        {props.hint}
      </p>
    </div>
  );
}

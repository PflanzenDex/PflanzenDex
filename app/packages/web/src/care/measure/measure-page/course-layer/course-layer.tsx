import { useLocation, useSearchParams } from "react-router";
import type { MeasurementView } from "@pflanzendex/core";
import { EmptyState } from "@/shared/patterns/elements/empty-state/empty-state";
import { SegmentedControl } from "@/shared/patterns/elements/segmented-control/segmented-control";
import { LayerSheet, useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { texts } from "@/shared/lib/text-rules/texts";
import { GrowthChart } from "../../measurement-header/growth-chart";
import { MeasurementFacts } from "../../measurement-header/measurement-header";
import { MeasurementList } from "../../measurement-list/measurement-list";
import table from "./course-layer.de.json";

type Token = () => Promise<string | undefined>;

const t = texts(table);

/** The parts of the layer in their order (US-WAC-01, US-QS-15); the segment shows them with these labels. */
const OPTIONS = [
  { value: "ueberblick", label: t("part.overview") },
  { value: "kurve", label: t("part.curve") },
  { value: "messungen", label: t("part.entries") },
] as const;
type Part = (typeof OPTIONS)[number]["value"];

const PART_PARAM = "teil";

/**
 * The part in the address (`&teil=ueberblick|kurve|messungen`): an absent or unknown value means "Überblick". A change
 * replaces the entry and keeps the state of the layer, as the parts of the plant layer do (US-QS-23).
 */
function usePart(): [Part, (value: Part) => void] {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const raw = params.get(PART_PARAM);
  const part = OPTIONS.find((o) => o.value === raw)?.value ?? "ueberblick";
  const choose = (value: Part) => {
    const next = new URLSearchParams(params);
    next.set(PART_PARAM, value);
    setParams(next, { replace: true, state: location.state });
  };
  return [part, choose];
}

/**
 * The course of a specimen as its own layer "Verlauf" (US-WAC-01, US-QS-15): the segment "Überblick | Kurve |
 * Messungen" (the facts, the growth chart and the measurements with their photos). Without a measurement the layer
 * shows the facts and one empty state with the action that closes the layer and hands the keeper back to the form
 * (`onAdd`), so the empty state appears once.
 */
export function CourseLayer(props: {
  id: string;
  name: string;
  view: MeasurementView;
  photo: { api: string; token: Token; specimenId: string };
  records?: ReadonlySet<string> | undefined;
  onPhotoSaved: () => void;
}) {
  const { id, name, view, photo, records, onPhotoSaved } = props;
  const { closeLayer } = useLayer(id);
  const [part, choose] = usePart();
  return (
    <LayerSheet id={id} title={t("title", { name })}>
      {view.measurements.length === 0 ? (
        <div className="flex flex-col gap-6">
          <MeasurementFacts view={view} />
          <EmptyState
            title={t("empty.title")}
            description={t("empty.description")}
            action={{ label: t("empty.action"), onClick: closeLayer }}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <SegmentedControl
            label={t("parts.label")}
            options={OPTIONS}
            value={part}
            onChange={choose}
          />
          {part === "messungen" ? (
            <MeasurementList
              measurements={view.measurements}
              records={records}
              photo={photo}
              onPhotoSaved={onPhotoSaved}
            />
          ) : part === "kurve" ? (
            <GrowthChart measurements={view.measurements} />
          ) : (
            <MeasurementFacts view={view} />
          )}
        </div>
      )}
    </LayerSheet>
  );
}

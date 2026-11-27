// The page a scanned pot label opens (US-BES-17, FR-BES-25): the plant of the signed-in keeper with the quick actions
// "Gegossen" and "Messen". The address carries only the specimen id, which is opaque (FR-BES-25); nothing of the plant
// is read before the keeper is signed in (the app shows the sign-in first), and a foreign id looks like an unknown one.
import { useState } from "react";
import { RefusalClose } from "@/shared/patterns/states/banner/banner";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { Tag } from "lucide-react";
import { isActive, type Specimen } from "@pflanzendex/core";
import { MeasurePage } from "@/care";
import { markFertilized, markWatered } from "@/monitoring";
import {
  call,
  dailyRun,
  useFeature,
  useInvalidate,
  useRequest,
  useWriteAction,
} from "@/shared/data";
import { errorText } from "@/shared/lib/error-text";
import { texts } from "@/shared/lib/text-rules/texts";
import {
  ADD_PLANT_PATH,
  PATHS,
  plantAddress,
} from "@/shared/patterns/navigation/navigation/navigation";
import { PageHeader } from "@/shared/patterns/navigation/page-header/page-header";
import { EmptyState } from "@/shared/patterns/elements/empty-state/empty-state";
import { LayerHost } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { RequestState } from "@/shared/patterns/states/request-state/request-state";
import { Button } from "@/shared/ui/button";
import table from "./pot-label-page.de.json";
import { Archived } from "./pot-label-page.archived";
import { LastFertilized } from "./last-fertilized/last-fertilized";
import { PotLabelSkeleton } from "./pot-label-page.skeleton";

type Token = () => Promise<string | undefined>;
const ui = texts(table);

const loadSpecimen = (api: string, token: string, id: string) =>
  call<Specimen>(fetch, `${api}/specimens/${encodeURIComponent(id)}`, token);

/** The scanned label. Switched off (P-12), it leads to the plant's normal view and asks nothing of the server. */
export function PotLabelPage(props: { api: string; token: Token }) {
  const { id = "" } = useParams();
  const on = useFeature("pot_labels");
  if (!on) return <Navigate to={plantAddress(id)} replace />;
  // One screen (DS-61, US-QS-15): the page fits the window and its content scrolls inside it at a larger text size; a
  // page taller than the window (200 % text, the taller bar) would scroll the whole document instead.
  return (
    <LayerHost className="min-h-0" data-fit-screen="" data-fit-fill="">
      <LabelPlant api={props.api} token={props.token} id={id} />
    </LayerHost>
  );
}

function LabelPlant(props: { api: string; token: Token; id: string }) {
  const { api, token, id } = props;
  const navigate = useNavigate();
  const [measuring, setMeasuring] = useState(false);
  const plant = useRequest<Specimen>({
    queryKey: ["label", "specimen", id],
    token,
    load: (t) => loadSpecimen(api, t, id),
  });
  const specimen = plant.value;
  // The same answer for a foreign and an unknown id (P-05): one view, no name, no hint that the plant exists.
  if (plant.error?.code === "specimen.not_found") return <NotFound />;
  if (specimen && !measuring && !isActive(specimen))
    return <Archived api={api} token={token} id={id} specimen={specimen} />;
  return (
    <RequestState
      status={plant.status}
      {...(plant.error ? { errorText: errorText(plant.error.code) } : {})}
      onRetry={plant.retry}
      skeleton={<PotLabelSkeleton label={ui("loading")} />}
      heading={ui("heading")}
      offline={plant.offline}
    >
      {specimen && measuring ? (
        <MeasurePage
          api={api}
          token={token}
          specimen={{ id: specimen.id, name: specimen.name }}
          onBack={() => navigate(plantAddress(id))}
        />
      ) : specimen ? (
        <Quick api={api} token={token} specimen={specimen} onMeasure={() => setMeasuring(true)} />
      ) : null}
    </RequestState>
  );
}

/**
 * The active plant with its quick actions (US-BES-17, P-09); an archived plant opens `Archived` instead (see `LabelPlant`).
 * "Gegossen" and "Gedüngt" refresh all monitoring data, so the watering and the fertilizing line show the new state (US-MON-05, US-MON-09).
 */
function Quick(props: { api: string; token: Token; specimen: Specimen; onMeasure: () => void }) {
  const { api, token, specimen, onMeasure } = props;
  const write = useWriteAction(token, useInvalidate(["monitoring"]));
  const daily = dailyRun(write, "specimen", specimen.id);
  return (
    <section aria-labelledby="pot-label-title" className="flex min-w-0 flex-col gap-4">
      <PageHeader headingId="pot-label-title" title={specimen.name} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Button
          type="button"
          size="touch"
          disabled={write.running}
          onClick={() =>
            daily((t, o) => markWatered(api, t, [specimen.id], o), ui("watered"), "water")
          }
        >
          {ui("water")}
        </Button>
        <Button
          type="button"
          size="touch"
          variant="tinted"
          disabled={write.running}
          onClick={() =>
            daily((t, o) => markFertilized(api, t, specimen.id, o), ui("fertilized"), "fertilize")
          }
        >
          {ui("fertilize")}
        </Button>
        <Button type="button" size="touch" variant="plain" onClick={onMeasure}>
          {ui("measure")}
        </Button>
      </div>
      <LastFertilized api={api} token={token} specimenId={specimen.id} />
      {write.message ? (
        <p role="status" className="text-sm">
          {write.message}
        </p>
      ) : null}
      {write.error ? (
        <p role="alert" className="rounded-lg border border-destructive p-2 text-sm">
          {errorText(write.error.code)}
          <RefusalClose error={write.error} />
        </p>
      ) : null}
      <Button asChild variant="link">
        <Link to={plantAddress(specimen.id)}>{ui("toPlant")}</Link>
      </Button>
    </section>
  );
}

/** Foreign and unknown labels (P-05): no name, its own mark, the cause in one line, two ways on; its title is the bar's (US-QS-32). */
function NotFound() {
  const navigate = useNavigate();
  return (
    <>
      <PageHeader title={ui("notFoundPage")} />
      <EmptyState
        level={2}
        icon={Tag}
        title={ui("notFound")}
        description={ui("notFoundCause")}
        action={{ label: ui("addPlant"), onClick: () => void navigate(ADD_PLANT_PATH) }}
        secondary={{ label: ui("toCollection"), onClick: () => void navigate(PATHS.collection) }}
      />
    </>
  );
}

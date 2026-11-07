// The page a scanned pot label opens (US-BES-17, FR-BES-25): the plant of the signed-in keeper with the quick actions
// "Gegossen" and "Messen". The address carries only the specimen id, which is opaque (FR-BES-25); nothing of the plant
// is read before the keeper is signed in (the app shows the sign-in first), and a foreign id looks like an unknown one.
import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { isActive, type Specimen } from "@pflanzendex/core";
import { MeasurePage } from "@/care";
import { markFertilized, markWatered } from "@/monitoring";
import { call, useFeature, useInvalidate, useRequest, useWriteAction } from "@/shared/data";
import { errorText } from "@/shared/lib/error-text";
import { texts } from "@/shared/lib/text-rules/texts";
import { PATHS } from "@/shared/patterns/navigation/navigation/navigation";
import { PageHeader } from "@/shared/patterns/navigation/page-header/page-header";
import { LayerHost } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { PlantLoader } from "@/shared/patterns/states/plant-loader/plant-loader";
import { RequestState } from "@/shared/patterns/states/request-state/request-state";
import { Button } from "@/shared/ui/button/button";
import { plantLayerId } from "../../plants-screen/rows/plant-tile/plant-tile";
import table from "./pot-label-page.de.json";
import { LastFertilized } from "./last-fertilized/last-fertilized";

type Token = () => Promise<string | undefined>;
const ui = texts(table);

/** The normal view of the plant: its layer in the plants of the Sammlung (US-QS-19). */
const plantAddress = (id: string) => `${PATHS.collection}?view=plants&sheet=${plantLayerId(id)}`;

const loadSpecimen = (api: string, token: string, id: string) =>
  call<Specimen>(fetch, `${api}/specimens/${encodeURIComponent(id)}`, token);

/** The scanned label. Switched off (P-12), it leads to the plant's normal view and asks nothing of the server. */
export function PotLabelPage(props: { api: string; token: Token }) {
  const { id = "" } = useParams();
  const on = useFeature("pot_labels");
  if (!on) return <Navigate to={plantAddress(id)} replace />;
  return (
    <LayerHost>
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
  return (
    <RequestState
      status={plant.status}
      {...(plant.error ? { errorText: errorText(plant.error.code) } : {})}
      onRetry={plant.retry}
      skeleton={<PlantLoader label={ui("loading")} size="lg" className="mx-auto my-8 flex" />}
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
 * The plant with its two quick actions; an archived plant says so and offers no action (US-BES-17, P-09, P-10).
 * "Gegossen" and "Gedüngt" refresh all monitoring data, so the watering and the fertilizing line show the new state (US-MON-05, US-MON-09).
 */
function Quick(props: { api: string; token: Token; specimen: Specimen; onMeasure: () => void }) {
  const { api, token, specimen, onMeasure } = props;
  const write = useWriteAction(token, useInvalidate(["monitoring"]));
  return (
    <section aria-labelledby="pot-label-title" className="flex min-w-0 flex-col gap-4">
      <PageHeader headingId="pot-label-title" title={specimen.name} />
      {!isActive(specimen) ? (
        <>
          <p className="text-sm">{errorText("specimen.archived")}</p>
          <Button asChild variant="outline" size="touch">
            <Link to={PATHS.collection}>{ui("toCollection")}</Link>
          </Button>
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Button
              type="button"
              size="touch"
              disabled={write.running}
              onClick={() =>
                void write.run((t) => markWatered(api, t, [specimen.id]), ui("watered"))
              }
            >
              {ui("water")}
            </Button>
            <Button
              type="button"
              size="touch"
              variant="outline"
              disabled={write.running}
              onClick={() =>
                void write.run((t) => markFertilized(api, t, specimen.id), ui("fertilized"))
              }
            >
              {ui("fertilize")}
            </Button>
            <Button type="button" size="touch" variant="outline" onClick={onMeasure}>
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
            </p>
          ) : null}
          <Button asChild variant="link">
            <Link to={plantAddress(specimen.id)}>{ui("toPlant")}</Link>
          </Button>
        </>
      )}
    </section>
  );
}

/** Foreign and unknown labels: the same text, nothing of a collection (P-05). The way on leads to the collection. */
function NotFound() {
  return (
    <section aria-labelledby="pot-label-title" className="flex min-w-0 flex-col gap-4">
      <PageHeader headingId="pot-label-title" title={ui("notFound")} />
      <p className="text-sm">{errorText("specimen.not_found")}</p>
      <Button asChild variant="outline" size="touch">
        <Link to={PATHS.collection}>{ui("toCollection")}</Link>
      </Button>
    </section>
  );
}

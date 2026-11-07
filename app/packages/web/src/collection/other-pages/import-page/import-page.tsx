// The page that imports plants from a CSV file (US-BES-18, FR-BES-26): choose the file, check the preview with the fixes of
// the keeper, import the ready rows. The steps are kept in component state; the switch "csv_import" off sends the address
// to the collection (P-12).
import { Navigate } from "react-router";
import { useFeature } from "@/shared/data";
import { FullView } from "@/shared/patterns/navigation/full-view/full-view";
import { PATHS } from "@/shared/patterns/navigation/navigation/navigation";
import { texts } from "@/shared/lib/text-rules/texts";
import { ChooseStep } from "./views/choose-step/choose-step";
import { PreviewStep } from "./views/preview-step/preview-step";
import { ResultStep } from "./views/result-step/result-step";
import { useImportFlow, type ImportFlow } from "./import-flow";
import table from "./import-page.de.json";

type Token = () => Promise<string | undefined>;
const ui = texts(table);

/** The import page (US-BES-18): while the keeper switch is off the address leads to the collection (P-12). */
export function ImportPage(props: { api: string; token: Token }) {
  const on = useFeature("csv_import");
  if (!on) return <Navigate to={PATHS.collection} replace />;
  return <ImportView api={props.api} token={props.token} />;
}

function ImportView(props: { api: string; token: Token }) {
  const view = useImportFlow(props.api, props.token);
  const { step, arrivals } = view.flow;
  // A step that arrives takes the focus on its heading; the first step of the page keeps the focus of the route (DS-68).
  const moved = arrivals > 0;
  return (
    // One screen (US-QS-15, DS-61): the frame fills the free height, and a long list pages inside it (issue 1413).
    <div data-fit-screen="" data-fit-fill="" className="flex min-h-0 min-w-0 flex-col">
      <FullView
        headingId="import-title"
        title={ui("heading")}
        back={{ label: ui("back"), to: PATHS.collection }}
      >
        <Current step={step} view={view} moved={moved} />
      </FullView>
    </div>
  );
}

/** The step on screen. Each step is its own element, so a new step mounts and takes the focus once. */
function Current(props: { step: ImportFlow["flow"]["step"]; view: ImportFlow; moved: boolean }) {
  const { step, view, moved } = props;
  if (step === "preview") return <PreviewStep view={view} moved={moved} />;
  if (step === "result") return <ResultStep view={view} moved={moved} />;
  return <ChooseStep view={view} moved={moved} />;
}

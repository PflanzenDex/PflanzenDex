import { useLocation, useSearchParams } from "react-router";
import { useFeature } from "@/shared/data";
import { SegmentedControl } from "@/shared/patterns/elements/segmented-control/segmented-control";
import { texts } from "@/shared/lib/text-rules/texts";
import { PlantHistory } from "../plant-detail/plant-history/plant-history";
import { PlantLeaves } from "../plant-leaves/plant-leaves";
import table from "./plant-course.de.json";

const t = texts(table);

type Token = () => Promise<string | undefined>;
type Props = { api: string; token: Token; specimenId: string; onMeasure?: () => void };

/** The two lists of "Verlauf" (US-WAC-07): the measurements (the default) and the leaves of the leaf log. */
const OPTIONS = [
  { value: "measurements", label: t("measurements") },
  { value: "leaves", label: t("leaves") },
] as const;
type Course = (typeof OPTIONS)[number]["value"];

const COURSE_PARAM = "course";

/**
 * The list in the address (`&course=measurements|leaves`): an absent or unknown value means the measurements. A change
 * replaces the entry and keeps the state of the layer, as the tabs and parts of the layers do (US-QS-23).
 */
function useCourse(): [Course, (value: Course) => void] {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const raw = params.get(COURSE_PARAM);
  const course = OPTIONS.find((o) => o.value === raw)?.value ?? "measurements";
  const choose = (value: Course) => {
    const next = new URLSearchParams(params);
    next.set(COURSE_PARAM, value);
    setParams(next, { replace: true, state: location.state });
  };
  return [course, choose];
}

/**
 * "Verlauf" of a plant (US-QS-23, US-WAC-07): the measurements, and with the keeper switch `leaf_log` on a switch
 * "Messungen | Blätter" in front of one list at a time. The switch keeps its focus when the list changes, because the
 * list is no new view (route-focus). With the switch off only the measurements show, as before (P-12).
 */
export function PlantCourse(props: Props) {
  const on = useFeature("leaf_log");
  const [course, choose] = useCourse();
  if (!on) return <PlantHistory {...props} />;
  return (
    <div className="grid gap-3">
      <SegmentedControl label={t("label")} options={OPTIONS} value={course} onChange={choose} />
      {course === "leaves" ? (
        <PlantLeaves api={props.api} token={props.token} specimenId={props.specimenId} />
      ) : (
        <PlantHistory {...props} />
      )}
    </div>
  );
}

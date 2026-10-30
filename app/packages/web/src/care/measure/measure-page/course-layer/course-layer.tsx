import type { MeasurementView } from "@pflanzendex/core";
import { LayerSheet, useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { MeasurementFacts } from "../../measurement-header/measurement-header";
import { MeasurementList } from "../../measurement-list/measurement-list";

type Token = () => Promise<string | undefined>;

/**
 * The course of a specimen as its own layer "Verlauf" (US-WAC-01, US-QS-15): the facts first, then the measurements with
 * their photos. The layer closes before the empty course hands the keeper back to the form (`onAdd`).
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
  return (
    <LayerSheet id={id} title={`Verlauf: ${name}`}>
      <div className="flex flex-col gap-6">
        <MeasurementFacts view={view} />
        <MeasurementList
          measurements={view.measurements}
          records={records}
          photo={photo}
          onPhotoSaved={onPhotoSaved}
          onAdd={closeLayer}
        />
      </div>
    </LayerSheet>
  );
}

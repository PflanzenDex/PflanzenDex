import { Link } from "react-router";
import { Button } from "@/shared/ui/button/button";
import { profileAddress } from "@/shared/patterns/navigation/navigation/navigation";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../../light.de.json";

const t = texts(table);
/** The layer of my care profile on the species profile (US-BES-09, the sheet key of `species-page`). */
const CARE_SHEET = "care";

/**
 * The one next step for an unknown light need (US-LIC-01, P-09): "Lichtbedarf eintragen" opens the care profile of the
 * species at the zone choice. Every view that derives a zone shows this one control. Inside that profile `onChoose`
 * moves the focus to the zone choice instead of opening the address again.
 */
export function LightNeedAction(props: {
  speciesId: string;
  speciesName: string;
  onChoose?: () => void;
}) {
  const label = t("need.labelFor", { name: props.speciesName });
  const onChoose = props.onChoose;
  if (onChoose !== undefined)
    return (
      <Button type="button" variant="outline" size="sm" aria-label={label} onClick={onChoose}>
        {t("need.action")}
      </Button>
    );
  return (
    <Button asChild variant="outline" size="sm">
      <Link to={`${profileAddress(props.speciesId)}?sheet=${CARE_SHEET}`} aria-label={label}>
        {t("need.action")}
      </Link>
    </Button>
  );
}

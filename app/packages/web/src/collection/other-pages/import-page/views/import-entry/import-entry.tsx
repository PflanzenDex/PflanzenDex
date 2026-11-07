// The entry "Aus Datei importieren" where plants are added (US-BES-18): an outline link, never a second filled action. It is
// hidden while the keeper switch "csv_import" is off (P-12); the collection header and its layers do not offer it.
import { Link } from "react-router";
import { useFeature } from "@/shared/data";
import { cn } from "@/shared/lib/utils";
import { texts } from "@/shared/lib/text-rules/texts";
import { IMPORT_PATH } from "@/shared/patterns/navigation/navigation/navigation";
import { buttonVariants } from "@/shared/ui/button/button";
import table from "../../import-page.de.json";

const ui = texts(table);

export function ImportEntry() {
  const on = useFeature("csv_import");
  if (!on) return null;
  return (
    <Link to={IMPORT_PATH} className={cn(buttonVariants({ variant: "outline" }), "self-start")}>
      {ui("entry")}
    </Link>
  );
}

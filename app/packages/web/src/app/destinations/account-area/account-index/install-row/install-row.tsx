// US-QS-28 · The row of the Konto index that installs the app, or the short guide for Safari on an iPhone or iPad (issue
// 1690). It is one row of the list like the others, above "Abmelden…", so that the list still fits 360 × 640 px (DS-58). The
// offer comes from the install store (shared/platform/device/service-worker/install-prompt.ts); nothing shows when the
// browser offers no installation or the app is installed.
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { texts } from "@/shared/lib/text-rules/texts";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button/button";
import {
  promptInstall,
  useInstallOffer,
} from "@/shared/platform/device/service-worker/install-prompt";
import table from "./install-row.de.json";

const t = texts(table);

// The classes of a row of the index (ROW in account-index.tsx), without its hover and focus parts for the static guide.
const BASE =
  "flex min-h-11 w-full items-center gap-3 rounded-lg border-l-4 border-transparent px-3 py-1 text-left text-base text-foreground";
const LABELLED = "flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3";
const VALUE = "text-sm font-normal text-muted-foreground";

/** The install row, or the guide on Safari (a text row without an action), as an item of the index list. */
export function InstallRow() {
  const offer = useInstallOffer();
  const [failed, setFailed] = useState(false);
  if (offer === "ios-guide") {
    return (
      <li className={BASE}>
        <span className={LABELLED}>
          <span className="font-semibold [overflow-wrap:anywhere]">{t("iosTitle")}</span>
          <span className={VALUE}>{t("iosSteps")}</span>
        </span>
      </li>
    );
  }
  if (offer !== "promptable" && !failed) return null;
  const install = async () => {
    setFailed(false);
    if ((await promptInstall()) === "failed") setFailed(true);
  };
  return (
    <li>
      {offer === "promptable" && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => void install()}
          className={cn(BASE, "h-auto justify-start font-normal hover:bg-muted")}
        >
          <span className={LABELLED}>
            <span>{t("install")}</span>
          </span>
          <ChevronRight
            aria-hidden="true"
            className="ml-auto size-4 shrink-0 text-muted-foreground"
          />
        </Button>
      )}
      {failed && (
        <p role="status" className="mt-1 rounded-lg border border-border p-3 text-sm">
          {t("failed")}
        </p>
      )}
    </li>
  );
}

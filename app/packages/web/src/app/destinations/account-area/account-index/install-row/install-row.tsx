// US-QS-28 · The row of the Konto index that installs the app, or the short guide for Safari on an iPhone or iPad (issue
// 1690). It is one row of the group "App" like the others (US-QS-32), so that the index still fits 360 × 640 px (DS-58).
// The offer comes from the install store (shared/platform/device/service-worker/install-prompt.ts); nothing shows when the
// browser offers no installation or the app is installed.
import { texts } from "@/shared/lib/text-rules/texts";
import { GroupedRow } from "@/shared/lists/grouped-list/grouped-list";
import {
  promptInstall,
  useInstallOffer,
  useInstallRefused,
} from "@/shared/platform/device/service-worker/install-prompt";
import table from "./install-row.de.json";

const t = texts(table);

/** The install row, or the guide on Safari (a plain row without an action), as an item of the index group "App". */
export function InstallRow() {
  const offer = useInstallOffer();
  const refused = useInstallRefused();
  if (offer === "ios-guide") {
    return <GroupedRow title={t("iosTitle")} meta={t("iosSteps")} />;
  }
  if (offer !== "promptable" && !refused) return null;
  return (
    <>
      {offer === "promptable" && (
        <GroupedRow title={t("install")} onClick={() => void promptInstall()} />
      )}
      {refused && (
        <li className="px-4 py-3">
          <p role="status" className="rounded-lg border border-border p-3 text-sm">
            {t("failed")}
          </p>
        </li>
      )}
    </>
  );
}

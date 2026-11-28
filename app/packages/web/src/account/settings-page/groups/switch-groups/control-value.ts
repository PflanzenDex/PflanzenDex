import { texts } from "@/shared/lib/text-rules/texts";
import type { AccountProfile } from "../../../api/account-api";
import table from "./switch-groups.de.json";

const t = texts(table);

/** The row "Bedienung" on the settings list: the two choices of the layer in one line (US-QS-11, US-QS-33, US-QS-32). */
export const controlValue = (p: AccountProfile): string =>
  t("control.value", {
    shortcuts: t(`control.shortcuts.${p.keyboardShortcuts}`),
    motion: t(`control.motion.${p.motion}`),
  });

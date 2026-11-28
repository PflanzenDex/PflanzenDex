import { useEffect } from "react";
import { SwitchRow } from "@/shared/lists/switch-row/switch-row";
import { refusalText } from "@/shared/lib/error-text";
import { texts } from "@/shared/lib/text-rules/texts";
import { RefusalClose } from "@/shared/patterns/states/banner/banner";
import { useAnnounce } from "@/shared/platform/announcer/context";
import type { ApiError } from "../../../../shared/data";
import table from "./registration-switch.de.json";

const t = texts(table);

/**
 * The registration mode as a switch on the overview (US-ACC-05, US-QS-32, SG-CTRL-02): on means that new people need an
 * invitation code. It saves at once; the switch is the result and the announcer says it (SG-FEED-04). A refusal keeps the switch
 * where it was and says why at the row, with the control that frees a held key (US-QS-03, P-10). One write runs at a time.
 */
export function RegistrationSwitch(props: {
  invitationOnly: boolean;
  running: boolean;
  error: ApiError | null;
  /** The text of the last saved change; it is said once to assistive technology, and shows in no box (SG-FEED-04). */
  message: string | null;
  onChange: (invitationOnly: boolean) => void;
}) {
  const announce = useAnnounce();
  useEffect(() => {
    if (props.message) announce?.announce(props.message);
  }, [props.message, announce]);
  return (
    <SwitchRow
      bare
      compact
      name="invitationOnly"
      label={t("label")}
      help={t("help")}
      checked={props.invitationOnly}
      busy={props.running}
      needsNetwork
      error={
        props.error ? (
          <>
            {refusalText(props.error)}
            <RefusalClose error={props.error} />
          </>
        ) : undefined
      }
      onCheckedChange={props.onChange}
    />
  );
}

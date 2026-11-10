import { useState } from "react";
import type { RepotHint, RepotSign } from "@pflanzendex/core";
import { SIGN_IN, type ApiError } from "@/shared/data";
import { refusalText } from "@/shared/lib/error-text";
import { texts } from "@/shared/lib/text-rules/texts";
import { Checkbox } from "@/shared/ui/fields/checkbox/checkbox";
import type { PhotoAccess } from "@/shared/platform/browser/use-stored-photo";
import { Quiet, Warning } from "../../../../specimens/cards/parts/parts";
import { setRepotSign } from "../../repot-api";
import table from "../../repot.de.json";

const t = texts(table);

/** The observations in the order of the form (US-BES-19); each is one sign of DM-BES-09. */
const SIGNS: readonly RepotSign[] = ["roots_out", "dries_fast", "tips_over"];

/** The message key of each observation: the keys are camel case, as the message tables require (FR-QG-26). */
const SIGN_KEY = {
  roots_out: "sign.rootsOut",
  dries_fast: "sign.driesFast",
  tips_over: "sign.tipsOver",
} as const satisfies Record<RepotSign, string>;

/** The German name of an observation, as the keeper reads it (US-BES-19). */
export const signLabel = (sign: RepotSign): string => t(SIGN_KEY[sign]);

/**
 * The three observations (US-BES-19): a tick writes the observation of that day, a clear removes it. A refused write
 * stays on screen with its German text (P-10); a written one reloads the plan, so the hint shows or goes at once.
 */
export function Observations(props: {
  access: PhotoAccess;
  id: string;
  hints: readonly RepotHint[];
  reload: () => void;
}) {
  const { access, id, hints, reload } = props;
  const [busy, setBusy] = useState<RepotSign | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const change = async (sign: RepotSign, ticked: boolean) => {
    setBusy(sign);
    setError(null);
    const token = await access.token();
    const r = token
      ? await setRepotSign(access.api, token, { id, sign, ticked })
      : { ok: false as const, error: SIGN_IN };
    setBusy(null);
    if (r.ok) reload();
    else setError(r.error);
  };
  return (
    <fieldset className="grid gap-1 border-0 p-0">
      <legend className="font-semibold">{t("observe.legend")}</legend>
      <Quiet>{t("observe.hint")}</Quiet>
      {SIGNS.map((sign) => (
        <Checkbox
          key={sign}
          checked={hints.some((h) => h.reason === sign)}
          disabled={busy !== null}
          onChange={(e) => void change(sign, e.currentTarget.checked)}
        >
          {signLabel(sign)}
        </Checkbox>
      ))}
      {error ? (
        <Warning>
          <p>{refusalText(error)}</p>
        </Warning>
      ) : null}
    </fieldset>
  );
}

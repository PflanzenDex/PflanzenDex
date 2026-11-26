import { useState } from "react";
import type { RepotHint, RepotSign } from "@pflanzendex/core";
import { entityKey, SIGN_IN, type ApiError, useRepeatKey } from "@/shared/data";
import { refusalText } from "@/shared/lib/error-text";
import { texts } from "@/shared/lib/text-rules/texts";
import { Checkbox } from "@/shared/ui/checkbox";
import type { PhotoAccess } from "@/shared/platform/browser/use-stored-photo";
import { Quiet, ErrorNotice } from "../../../../specimens/cards/parts/parts";
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

/** A tick that was not saved: its sign and the tick the keeper gave, so "Erneut versuchen" repeats that same change (US-QS-32). */
type Failed = { sign: RepotSign; ticked: boolean; error: ApiError };

/**
 * The three observations (US-BES-19): a tick writes the observation of that day, a clear removes it. A refused write
 * stays on screen as an error that names its sign, with its German text and "Erneut versuchen" (P-10, SG-STATE-03); a
 * written one reloads the plan, so the hint shows or goes at once.
 */
export function Observations(props: {
  access: PhotoAccess;
  id: string;
  hints: readonly RepotHint[];
  reload: () => void;
}) {
  const { access, id, hints, reload } = props;
  const [busy, setBusy] = useState<RepotSign | null>(null);
  const [failed, setFailed] = useState<Failed | null>(null);
  const keys = useRepeatKey();
  const change = async (sign: RepotSign, ticked: boolean) => {
    setBusy(sign);
    setFailed(null);
    const token = await access.token();
    const r = token
      ? await keys.run(
          (key) => setRepotSign(access.api, token, { id, sign, ticked }, { key }),
          entityKey("specimen", id, `sign:${sign}:${ticked}`),
        )
      : { ok: false as const, error: SIGN_IN };
    setBusy(null);
    if (r.ok) reload();
    else setFailed({ sign, ticked, error: r.error });
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
      {failed ? (
        <ErrorNotice
          title={t("observe.failed", { sign: signLabel(failed.sign) })}
          action={{
            label: t("observe.retry"),
            onClick: () => void change(failed.sign, failed.ticked),
          }}
        >
          <p>{refusalText(failed.error)}</p>
        </ErrorNotice>
      ) : null}
    </fieldset>
  );
}

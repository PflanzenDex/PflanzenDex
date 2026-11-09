import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { loadAchievementSettings } from "@/achievements";
import { useRequest } from "@/shared/data";
import { texts } from "@/shared/lib/text-rules/texts";
import { Banner } from "@/shared/patterns/states/banner/banner";
import { Button } from "@/shared/ui/button/button";
import table from "../whats-new.de.json";
import { NEWS_COUNT, NEWS_ENTRIES, appVersion, markNewsSeen, unseenNow } from "../whats-new";

const t = texts(table);
type Token = () => Promise<string | undefined>;

// The dialog's code loads on the first open, not with "Heute" (DS-08, US-QS-27).
const WhatsNewDialog = lazy(() =>
  import("./whats-new-dialog/whats-new-dialog").then((m) => ({ default: m.WhatsNewDialog })),
);

/** The calm mode setting (US-ACH-08): `undefined` while it loads or when it cannot be read. */
function useCalmMode(api: string, token: Token): boolean | undefined {
  const load = useCallback((bearer: string) => loadAchievementSettings(api, bearer), [api]);
  const request = useRequest({ queryKey: ["achievements", "settings"], token, load });
  return request.value?.calmMode;
}

/**
 * The banner on "Heute" after an update (US-DEV-06, US-QS-27): "Neu in PflanzenDéx" with the version and the number of lines
 * this device has not seen. It shows once: when it shows, its lines count as seen, so a later start or visit finds nothing
 * new. "Neuerungen ansehen" opens the new lines in a dialog; "Hinweis ausblenden" hides it for the rest of the session.
 * Calm mode switches the hint off and not the information (US-ONB-07, US-ACH-08): no banner, and the lines count as seen at
 * once, so a later switch of calm mode shows no catch-up banner. While the setting is not known, nothing shows and nothing
 * is counted. A first visit shows nothing. The banner is the shared banner (DS-34), announced as a status.
 */
export function WhatsNewHint(props: { api: string; token: Token }) {
  const calm = useCalmMode(props.api, props.token);
  const [unseen] = useState(() => unseenNow(NEWS_COUNT));
  const [closed, setClosed] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogUsed, setDialogUsed] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (unseen > 0 && calm !== undefined) markNewsSeen(NEWS_COUNT);
  }, [calm, unseen]);

  if (unseen === 0 || calm !== false || closed) return null;
  const version = appVersion() ?? t("version.unknown");
  const summary =
    unseen === 1 ? t("hint.one", { version }) : t("hint.many", { version, count: unseen });
  return (
    <>
      <Banner
        variant="info"
        title={t("section.title")}
        dismissLabel={t("hint.dismiss")}
        onDismiss={() => setClosed(true)}
        className="mb-3"
      >
        <p className="m-0">{summary}</p>
        <Button
          ref={opener}
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          aria-haspopup="dialog"
          aria-expanded={dialogOpen}
          onClick={() => {
            setDialogUsed(true);
            setDialogOpen(true);
          }}
        >
          {t("hint.open")}
        </Button>
      </Banner>
      {dialogUsed ? (
        <Suspense fallback={null}>
          <WhatsNewDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            lines={NEWS_ENTRIES.slice(0, unseen)}
            version={version}
            onCloseFocus={() => opener.current?.focus()}
          />
        </Suspense>
      ) : null}
    </>
  );
}

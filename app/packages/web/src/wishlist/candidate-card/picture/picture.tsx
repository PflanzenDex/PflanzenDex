import { useEffect, useRef, useState } from "react";
import type { Candidate } from "@pflanzendex/core";
import { Button } from "@/shared/ui/button/button";
import { cn } from "@/shared/lib/utils";
import { DelayedSkeleton } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { useStoredPhoto, type PhotoAccess } from "@/shared/platform/browser/use-stored-photo";
import { errorText } from "@/shared/lib/error-text";
import { texts } from "@/shared/lib/text-rules/texts";
import { isPlainHttps } from "../../schemas";
import { LargePicture } from "./large-picture/large-picture";
import table from "../../wishlist.de.json";

const t = texts(table);

const placeholder =
  "grid min-h-18 place-items-center rounded-lg border border-dashed border-border text-muted-foreground";

/**
 * The small picture next to the title (US-WUN-06): 128 CSS px wide, a square box so the card does not jump when the
 * picture arrives (starting value, assumption). The 256 px thumbnail stays sharp at that size.
 */
const PICTURE_BOX = "aspect-square w-32 shrink-0 rounded-lg";

/**
 * The local copy (US-WUN-04): fetched with the token, so a viewer's browser never contacts a third-party host (P-05). The
 * card asks for the small thumbnail, not the full stored copy (NFR-12). A tap on the thumbnail opens the large view,
 * which asks for the full copy (US-WUN-06); when it closes, the focus goes back to the picture, as Radix would do for a
 * trigger (this view has none).
 */
export function StoredPicture(props: { c: Candidate; access: PhotoAccess; sourceLine: string }) {
  const { c, access, sourceLine } = props;
  const path = `/wishes/${encodeURIComponent(c.id)}/image`;
  const [large, setLarge] = useState(false);
  const pictureRef = useRef<HTMLButtonElement>(null);
  const wasLarge = useRef(false);
  const state = useStoredPhoto(access, path, { size: "thumb" });
  useEffect(() => {
    if (large) wasLarge.current = true;
    else if (wasLarge.current) {
      wasLarge.current = false;
      pictureRef.current?.focus();
    }
  }, [large]);
  if (typeof state !== "string")
    return state ? (
      <span role="status" className={cn(PICTURE_BOX, placeholder, "p-2 text-center text-sm")}>
        {errorText(state.code)}
      </span>
    ) : (
      // The box keeps its size at once; the loading status inside it shows after the delay (DS-57, issue 1726).
      <span className={cn(PICTURE_BOX, placeholder, "p-2 text-center text-sm")}>
        <DelayedSkeleton>
          <span role="status">{t("picture.loading")}</span>
        </DelayedSkeleton>
      </span>
    );
  return (
    <>
      <Button
        ref={pictureRef}
        type="button"
        variant="ghost"
        aria-label={t("picture.open", { title: c.title })}
        onClick={() => setLarge(true)}
        className={cn(PICTURE_BOX, "block p-0")}
      >
        <img
          src={state}
          alt={t("picture.alt", { title: c.title })}
          className="block size-full object-cover"
        />
      </Button>
      {large && (
        <LargePicture
          access={access}
          path={path}
          title={c.title}
          sourceLine={sourceLine}
          onClose={() => setLarge(false)}
        />
      )}
    </>
  );
}

/**
 * The picture of a candidate without a stored copy, as before: "Kein Bild", or the address, typed by a keeper, as a link
 * the viewer follows on purpose. Loading it would make every viewer's browser contact a third-party host (IP address,
 * browser, referrer) and breaks P-05. "Bild speichern" fetches a copy from Wikimedia Commons with its license; the server
 * refuses everything else with a clear text.
 */
export function Picture(props: {
  c: Candidate;
  onStoreImage: ((c: Candidate) => void) | undefined;
  busy: boolean;
}) {
  const { c, onStoreImage } = props;
  const image = c.image;
  if (!image || !isPlainHttps(image.url))
    return <span className={placeholder}>{t("picture.none")}</span>;
  return (
    <figure className="m-0 grid gap-1">
      <span className={placeholder}>
        <a
          href={image.url}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
          className="inline-flex min-h-[44px] items-center p-3 text-center text-primary underline decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("picture.external")}
        </a>
      </span>
      <figcaption className="text-sm text-muted-foreground">
        {t("picture.source", { source: image.source })}
      </figcaption>
      {onStoreImage && (
        <Button
          type="button"
          variant="outline"
          size="touch"
          disabled={props.busy}
          aria-label={t("picture.storeLabel", { title: c.title })}
          onClick={() => onStoreImage(c)}
        >
          {t("picture.store")}
        </Button>
      )}
    </figure>
  );
}

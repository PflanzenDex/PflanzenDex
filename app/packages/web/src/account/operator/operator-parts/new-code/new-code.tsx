import type { CreatedInvitation } from "@pflanzendex/core";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Button } from "@/shared/ui/button";
import { texts } from "@/shared/lib/text-rules/texts";
import { useAnnounce } from "@/shared/platform/announcer/context";
import { copyText, shareText } from "@/shared/platform/browser/clipboard";
import { instantText } from "../../../api/access-api";
import partsTable from "../operator-parts.de.json";

const t = texts(partsTable);

/**
 * Whether the box is narrower than its content, so the line scrolls (issue 2124, the rule of the value band): measured at
 * mount and again when the box or its content changes size (a new text size, a new window).
 */
function useScrolls(box: RefObject<HTMLElement | null>): boolean {
  const [scrolls, setScrolls] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setScrolls(el.scrollWidth > el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [box]);
  return scrolls;
}

/**
 * The code is shown exactly once; afterwards only its hash exists on the server. It is one line in monospace that scrolls
 * on its own when it cannot fit (200 % text). "Code teilen" passes the code to the share sheet and copies it where there is
 * none; "Code kopieren" copies it. A copy that worked reads "Kopiert" until the next action and is announced (US-ACC-05,
 * US-QS-32). A copy that failed shows its line and no success.
 */
export function NewCode(props: { created: CreatedInvitation }) {
  const { created } = props;
  const announce = useAnnounce()?.announce;
  const line = useRef<HTMLDivElement>(null);
  const scrolls = useScrolls(line);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");

  const copyCode = async () => {
    setCopy("idle");
    const ok = await copyText(created.code);
    setCopy(ok ? "copied" : "failed");
    announce?.(t(ok ? "code.copiedAnnounce" : "code.copyFailed"));
  };
  // A closed share sheet does nothing; a device without a share sheet, or one that refuses, gets the copy instead.
  const shareCode = async () => {
    setCopy("idle");
    const outcome = await shareText(created.code);
    if (outcome === "unsupported" || outcome === "failed") await copyCode();
  };

  return (
    <section
      aria-label={t("code.section")}
      className="flex flex-col gap-2 rounded-lg border-2 border-primary px-3 py-2"
    >
      <div
        ref={line}
        role="region"
        aria-label={t("code.label")}
        tabIndex={scrolls ? 0 : undefined}
        className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <code className="block font-mono text-base whitespace-nowrap select-all">
          {created.code}
        </code>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="tinted" onClick={() => void shareCode()}>
          {t("code.share")}
        </Button>
        <Button type="button" variant="link" onClick={() => void copyCode()}>
          {copy === "copied" ? t("code.copied") : t("code.copy")}
        </Button>
      </div>
      {copy === "failed" && <p>{t("code.copyFailed")}</p>}
      <p className="rounded-lg border border-border p-3">
        {t("code.validity", { until: instantText(created.expiresAt) })}
      </p>
    </section>
  );
}

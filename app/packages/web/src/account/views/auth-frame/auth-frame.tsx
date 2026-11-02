import type { ReactNode } from "react";

/** The three value lines of the frame; the sign-in theme shows the same three (app/config/dev/keycloak-theme, US-QS-14). */
const VALUE_LINES = [
  "Sammle deine Pflanzen wie Karten",
  "Miss Wachstum gegen deine eigene Geschichte",
  "Tausche Stecklinge mit Freunden",
] as const;

/**
 * The shelf of pots as line art in the brand green (US-QS-14, owner decision 2026-10-30). Decorative, so it is hidden
 * from assistive technology. The paths are the drawing of the sign-in theme (template.ftl): change both together.
 */
function ShelfDrawing() {
  return (
    <svg
      viewBox="0 0 400 120"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="h-16 w-auto max-w-full text-primary md:h-auto md:w-full md:max-w-[440px]"
    >
      <path d="M24 98 H376" strokeWidth={3} />
      <path d="M60 98 L54 112 M340 98 L346 112" />
      <path d="M52 66 H128" />
      <path d="M60 66 L70 98 H110 L120 66" />
      <path d="M90 66 V30" />
      <path d="M90 48 C78 46 70 38 70 26 C82 28 90 36 90 48" />
      <path d="M90 40 C100 38 110 28 110 16 C98 18 90 28 90 40" />
      <path d="M144 70 H236" />
      <path d="M150 70 C150 92 162 98 190 98 C218 98 230 92 230 70" />
      <path d="M190 70 C190 52 178 40 160 36" />
      <path d="M190 70 C190 50 202 38 222 34" />
      <path d="M190 58 C198 54 206 56 210 60 C204 64 196 64 190 58" />
      <path d="M256 56 H324" />
      <path d="M262 56 V98 H318 V56" />
      <path d="M290 56 C276 50 270 38 276 26" />
      <path d="M290 56 C304 50 310 38 304 26" />
      <path d="M290 56 V24" />
      <path d="M336 80 H372" />
      <path d="M342 80 L346 98 H366 L370 80" />
      <path d="M356 80 V64" />
      <path d="M356 70 C350 66 346 62 346 56 C352 58 356 64 356 70" />
      <path d="M356 66 C362 62 366 58 366 52 C360 54 356 60 356 66" />
    </svg>
  );
}

/**
 * The frame of the entry pages (US-QS-14): on a wide screen a calm panel with the drawing and the value lines on the
 * left and the content on the right; on a phone a band with the drawing above the content. The sign-in theme of the
 * Keycloak pages uses the same frame, the same tokens and the same German texts.
 */
export function AuthFrame(props: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh grid-cols-1 content-start md:grid-cols-2 md:content-stretch">
      <div className="flex flex-col items-center justify-center gap-3 bg-muted px-4 py-1.5 md:gap-8 md:p-12">
        <ShelfDrawing />
        <ul className="hidden list-none text-lg leading-snug text-muted-foreground md:block md:max-w-[440px]">
          {VALUE_LINES.map((line, index) => (
            <li key={line} className={index > 0 ? "mt-3" : undefined}>
              {line}
            </li>
          ))}
        </ul>
      </div>
      <main className="flex min-w-0 flex-col items-center px-4 pt-3 pb-4 md:justify-center md:p-12">
        <div className="flex w-full max-w-[26rem] min-w-0 flex-col">{props.children}</div>
      </main>
    </div>
  );
}

import { lazyPage } from "@/components/routing/lazy-page/lazy-page";
export { loadHints, saveHint } from "./hint-api";
export type { HintState } from "./hint-api";
/** The note code loads only when a hint is due (DS-08); the start page without a hint costs nothing. */
export const HintNote = lazyPage(() =>
  import("./hint-note/hint-note").then((m) => ({ default: m.HintNote })),
);

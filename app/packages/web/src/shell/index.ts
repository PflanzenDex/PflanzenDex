// Public interface of the module `shell` (ADR 0003): the app root and the lazy start page.
// The start page carries the onboarding forms: its chunk loads with its route (#451, DS-08).
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";

export { App } from "./app/app";
export const StartPage = lazyPage(() =>
  import("./start-page/start-page").then((m) => ({ default: m.StartPage })),
);

// Public interface of the module `privacy` (ADR 0003): download of all own data and deleting the account (US-ACC-04).
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";
export const PrivacySection = lazyPage(() =>
  import("./privacy-section/privacy-section").then((m) => ({ default: m.PrivacySection })),
);

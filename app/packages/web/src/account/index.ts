// Public interface of the `account` module (ADR 0003): sign-in, session, account view.
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";
export const SettingsPage = lazyPage(() =>
  import("./settings-page").then((m) => ({ default: m.SettingsPage })),
);
export const OperatorPage = lazyPage(() =>
  import("./operator-page").then((m) => ({ default: m.OperatorPage })),
);
export { AppError, AccountView, Loading, Welcome } from "./views";
export { apiUrl } from "./account-api";
export { useSession } from "./session";
export type { State } from "./session";
export { InvitationPage } from "./invitation-page";

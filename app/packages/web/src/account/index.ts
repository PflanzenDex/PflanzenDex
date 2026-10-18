// Public interface of the `account` module (ADR 0003): sign-in, session, account view.
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";
export const SettingsPage = lazyPage(() =>
  import("./settings-page/settings-page").then((m) => ({ default: m.SettingsPage })),
);
export const OperatorPage = lazyPage(() =>
  import("./operator/operator-page/operator-page").then((m) => ({ default: m.OperatorPage })),
);
export { AppError, AccountView, Loading, MeasuredView, Welcome } from "./views/views";
export { apiUrl } from "./api/account-api";
export type { Account } from "./api/account-api";
/** The question after the first plant (US-ONB-03): its code loads only when the first plant was saved (DS-08). */
export const KeeperStyleQuestion = lazyPage(() =>
  import("./settings-page/keeper-style/keeper-style").then((m) => ({
    default: m.KeeperStyleQuestion,
  })),
);
export { useSession } from "./session";
export type { State } from "./session";
/** Needed only while the invitation code is asked for: forms and validation stay out of the entry chunk (#451). */
export const InvitationPage = lazyPage(() =>
  import("./invitation-page/invitation-page").then((m) => ({ default: m.InvitationPage })),
);

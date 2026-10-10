// Public interface of the module `monitoring` (ADR 0003): the reminders of an account (inbox, settings, push devices; US-MON-01, US-MON-08).
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";
export const RemindersSection = lazyPage(() =>
  import("./reminders-section/reminders-section").then((m) => ({ default: m.RemindersSection })),
);

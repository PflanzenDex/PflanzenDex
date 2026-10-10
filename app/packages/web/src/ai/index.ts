// Public interface of the module `ai` (ADR 0003, ADR 0013): the connected AI clients of an account (US-KI-07).
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";
export const AiClientsSection = lazyPage(() =>
  import("./clients-section/clients-section").then((m) => ({ default: m.AiClientsSection })),
);

// Public interface of the module `ai` (ADR 0003, ADR 0013): the connected AI clients and their drafts (US-KI-07, US-KI-09).
import { lazyPage } from "@/components/routing/lazy-page/lazy-page";
export const AiSection = lazyPage(() =>
  import("./ai-section/ai-section").then((m) => ({ default: m.AiSection })),
);

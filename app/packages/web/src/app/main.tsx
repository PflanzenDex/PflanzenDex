import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { App } from "./flows";
import { createQueryClient } from "../shared/data";
import { TransitionRouter } from "../shared/platform/routing/route-transition/transition-router/transition-router";
import { registerAppWorker } from "../shared/platform/device/service-worker/register";
import "../styles/tokens.css";

const queryClient = createQueryClient();
const root = document.getElementById("root");
if (!root) throw new Error("Wurzelelement #root fehlt");
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TransitionRouter>
        <App />
      </TransitionRouter>
    </QueryClientProvider>
  </StrictMode>,
);

// The installed app takes a new version on its next start (US-QS-27): only production builds register the worker, a
// development server has none. The registration never throws (see register.ts).
if (import.meta.env.PROD) void registerAppWorker();

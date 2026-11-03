import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { App } from "./shell";
import { createQueryClient } from "./shared/data";
import { TransitionRouter } from "./shared/platform/routing/route-transition/transition-router/transition-router";
import "./styles/tokens.css";

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

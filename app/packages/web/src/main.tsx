import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { App } from "./app";
import { createQueryClient } from "./kernel";
import { TransitionRouter } from "./platform/route-transition/transition-router/transition-router";
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

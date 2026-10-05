import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { createQueryClient } from "./kernel";
import "./styles/tokens.css";

const queryClient = createQueryClient();
const root = document.getElementById("root");
if (!root) throw new Error("Wurzelelement #root fehlt");
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

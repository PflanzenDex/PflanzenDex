import { Hono } from "hono";
import { produktTitel } from "@pflanzendex/core";

export interface AppOptions {
  /** Kurzer Commit-Hash des laufenden Stands (aus dem Build, nicht geheim). */
  version?: string | undefined;
}

export function createApp(options: AppOptions = {}): Hono {
  const version = options.version ?? "unbekannt";
  const app = new Hono();
  app.get("/health", (c) => c.json({ status: "ok", produkt: produktTitel(), version }));
  return app;
}

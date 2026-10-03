import { Hono } from "hono";
import { produktTitel } from "@pflanzendex/core";

export function createApp(): Hono {
  const app = new Hono();
  app.get("/health", (c) => c.json({ status: "ok", produkt: produktTitel() }));
  return app;
}

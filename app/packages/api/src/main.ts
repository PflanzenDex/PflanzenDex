import { serve } from "@hono/node-server";
import { oeffnePool, testDatenbankUrl } from "@pflanzendex/db";
import { createApp } from "./app";
import { erstelleTokenPruefer } from "./auth/token";

// Konfiguration nur aus der Umgebung (keine Geheimnisse im Repo). Die Voreinstellungen passen zu `make auth-up`.
const issuer = process.env["OIDC_ISSUER"] ?? "http://localhost:18081/realms/pflanzendex";
const app = createApp({
  pruefer: erstelleTokenPruefer({
    issuer,
    audience: process.env["OIDC_AUDIENCE"] ?? "pflanzendex-api",
  }),
  pool: oeffnePool(process.env["DATABASE_URL"] ?? testDatenbankUrl()),
  webUrsprung: process.env["WEB_URSPRUNG"] ?? "http://localhost:5173",
  version: process.env["GIT_SHA"],
});

const port = Number(process.env["PORT"] ?? 3000);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API läuft auf http://localhost:${info.port}`);
});

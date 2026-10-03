import { serve } from "@hono/node-server";
import { openPool, testDatabaseUrl } from "@pflanzendex/db";
import { createApp } from "./app";
import { createTokenVerifier } from "./account";

// Configuration from the environment only (no secrets in the repo). The defaults match `make auth-up`.
const issuer = process.env["OIDC_ISSUER"] ?? "http://localhost:18081/realms/pflanzendex";
const app = createApp({
  reviewer: createTokenVerifier({
    issuer,
    audience: process.env["OIDC_AUDIENCE"] ?? "pflanzendex-api",
  }),
  version: process.env["APP_VERSION"],
  commit: process.env["GIT_SHA"],
  pool: openPool(process.env["DATABASE_URL"] ?? testDatabaseUrl()),
  webOrigin: process.env["WEB_ORIGIN"] ?? "http://localhost:5173",
});

const port = Number(process.env["PORT"] ?? 3000);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});

import { serve } from "@hono/node-server";
import { JobsPostgres, openPool, testDatabaseUrl } from "@pflanzendex/db";
import { createApp } from "./app";
import { createWikimediaDownload } from "./wishlist";
import { createJobWorker, JOB_HANDLERS } from "./jobs";
import { checkTaxonomy, pokedexJobHandlers, scheduleChecks } from "./pokedex";
import { remindersRuntime } from "./monitoring";
import { reminderOccasionsFor } from "./today";
import { measurementSourceFor } from "./care";
import { zoneStockFor } from "./zone-stock";
import { createMemorySourceCache, createSourceClient } from "./kernel";
import { createTokenVerifier } from "./account";
import { createS3ObjectStore, createSharpProcessor, s3ConfigFromEnv } from "./media";

// Configuration from the environment only (no secrets in the repo). The defaults match `make auth-up`.
const issuer = process.env["OIDC_ISSUER"] ?? "http://localhost:18081/realms/pflanzendex";
const pool = openPool(process.env["DATABASE_URL"] ?? testDatabaseUrl());
// Photo storage (US-WAC-06): without S3_* variables the photo upload answers 502 (the rest of the app is unaffected).
const s3 = s3ConfigFromEnv(process.env);
if (s3 && !("bucket" in s3)) console.warn(`Photo storage disabled, missing: ${s3.join(", ")}`);
const media =
  s3 && "bucket" in s3
    ? { store: createS3ObjectStore(s3), processor: createSharpProcessor() }
    : undefined;
// External sources (TE-09): shared by the background jobs and the wish images (US-WUN-04).
const userAgent = `PflanzenDex/${process.env["APP_VERSION"] ?? "dev"} (https://github.com/PflanzenDex/PflanzenDex)`;
const sources = createSourceClient({
  fetch,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: Date.now,
  cache: createMemorySourceCache(),
  userAgent,
});
const aiResource = process.env["AI_RESOURCE_URL"] ?? "http://localhost:3000/mcp";
const app = createApp({
  ...(media ? { media } : {}),
  wishImage: { sources, download: createWikimediaDownload({ fetch, userAgent }) },
  reviewer: createTokenVerifier({
    issuer,
    audience: process.env["OIDC_AUDIENCE"] ?? "pflanzendex-api",
  }),
  // The AI interface (US-KI-07): its tokens have their own audience, the URL of the interface (RFC 8707, spike TE-15).
  ai: {
    resource: aiResource,
    issuer,
    verifier: createTokenVerifier({ issuer, audience: aiResource }),
  },
  version: process.env["APP_VERSION"],
  commit: process.env["GIT_SHA"],
  pool,
  webOrigin: process.env["WEB_ORIGIN"] ?? "http://localhost:5173",
});

const port = Number(process.env["PORT"] ?? 3000);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});

// Background jobs (TE-06) run in the same process; the queue hands out each job once, also with several processes.
// Reminders (US-MON-01): the occasions come from the central status function; delivery is a stub until the operator
// provides the web push keys and a mail account (E-10, docs/specs/product/09-reminders-and-sensors.md).
const reminders = remindersRuntime({
  pool,
  source: reminderOccasionsFor(pool, {
    measurements: measurementSourceFor(pool),
    zoneStock: zoneStockFor(pool),
  }),
});
const worker = createJobWorker({
  queue: new JobsPostgres(pool),
  handlers: { ...JOB_HANDLERS, ...pokedexJobHandlers({ pool, sources }), ...reminders.handlers },
});
worker.start();
// The taxonomy build runs when the catalog differs from the stored tree (US-POK-03).
scheduleChecks(
  () => checkTaxonomy(pool, () => new Date()),
  60 * 60 * 1000,
  (error) => console.error("taxonomy check failed", error),
);
// The daily reminder checks that have come due are ordered every 5 minutes (starting value, assumption); a failure is
// reported and the next tick tries again.
scheduleChecks(
  () => reminders.tick(new Date()),
  5 * 60 * 1000,
  (error) => console.error("reminder scheduling failed", error),
);
process.on("SIGTERM", () => void worker.stop().then(() => process.exit(0)));

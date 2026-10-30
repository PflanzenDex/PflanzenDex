import { serve } from "@hono/node-server";
import { featuresFromEnv } from "@pflanzendex/core";
import {
  checkDbRoles,
  JobsPostgres,
  openPool,
  roleCheckMode,
  testDatabaseUrl,
} from "@pflanzendex/db";
import { createApp } from "./app";
import { createWikimediaDownload } from "./wishlist";
import { createJobWorker, JOB_HANDLERS } from "./jobs";
import { catalogFillEnabled, catalogFillJobHandlers, checkCatalogFill } from "./catalog";
import { checkTaxonomy, pokedexJobHandlers, scheduleChecks, taxonomyBuildEnabled } from "./pokedex";
import { reminderChannelFromEnv, remindersRuntime } from "./monitoring";
import { reminderOccasionsFor } from "./today";
import { measurementSourceFor } from "./care";
import { zoneStockFor } from "./zone-stock";
import { WRITE_LIMIT, createMemorySourceCache, createSourceClient } from "./kernel";
import { createTokenVerifier } from "./account";
import { deleteAccountHandlers, NO_STORE } from "./privacy";
import { attributeFillEnabled, attributeFillJobHandlers, checkAttributeFill } from "./discover";
import { createS3ObjectStore, createSharpProcessor, s3ConfigFromEnv } from "./media";

// Configuration from the environment only (no secrets in the repo). The defaults match `make auth-up`.
const issuer = process.env["OIDC_ISSUER"] ?? "http://localhost:18081/realms/pflanzendex";
// Where the keys come from, if not the issuer's public address (inside the deploy network, TE-03).
const jwksUrl = process.env["OIDC_JWKS_URL"];
const jwks = jwksUrl ? { jwksUrl } : {};
const pool = openPool(process.env["DATABASE_URL"] ?? testDatabaseUrl());
// Database roles (#907, P-04): a superuser or BYPASSRLS owner makes `security definer` functions ignore row security.
// `DB_ROLE_CHECK=enforce` (the compose deployment) stops the start; the default only warns (local dev uses the image's superuser).
await checkDbRoles(pool, roleCheckMode(process.env), (message) => console.warn(message));
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
// Feature switches (US-DEV-06): `FEATURES=social,ai`; in production nothing set means all off, elsewhere all on.
const features = featuresFromEnv(process.env);
// Catalog fill from open sources (US-BES-12): asks foreign servers, so only `CATALOG_FILL=on` starts it (P-08, FR-BES-18).
const catalogFill = catalogFillEnabled(process.env);
// Attribute fill (US-ENT-09): turns answers the catalog fill stored into species attributes, sends no request itself;
// only `ATTRIBUTE_FILL=on` starts it (P-08).
const attributeFill = attributeFillEnabled(process.env);
const app = createApp({
  features,
  ...(media ? { media } : {}),
  wishImage: { sources, download: createWikimediaDownload({ fetch, userAgent }) },
  reviewer: createTokenVerifier({
    issuer,
    audience: process.env["OIDC_AUDIENCE"] ?? "pflanzendex-api",
    ...jwks,
  }),
  // The AI interface (US-KI-07): its tokens have their own audience, the URL of the interface (RFC 8707, spike TE-15).
  ai: {
    resource: aiResource,
    issuer,
    verifier: createTokenVerifier({ issuer, audience: aiResource, ...jwks }),
  },
  version: process.env["APP_VERSION"],
  commit: process.env["GIT_SHA"],
  pool,
  // Basic per-client limit on writes (TE-03, #762).
  writeLimit: WRITE_LIMIT,
  webOrigin: process.env["WEB_ORIGIN"] ?? "http://localhost:5173",
});

const port = Number(process.env["PORT"] ?? 3000);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});

// Background jobs (TE-06) run in the same process; the queue hands out each job once, also with several processes.
// Reminders (US-MON-01): the occasions come from the central status function; delivery is Web Push once the operator
// sets the VAPID keys, otherwise a stub (E-10, ADR 0015, docs/specs/product/09-reminders-and-sensors.md).
const reminders = remindersRuntime({
  pool,
  channel: reminderChannelFromEnv(pool, process.env),
  source: reminderOccasionsFor(pool, {
    measurements: measurementSourceFor(pool),
    zoneStock: zoneStockFor(pool),
  }),
});
const worker = createJobWorker({
  queue: new JobsPostgres(pool),
  handlers: {
    ...JOB_HANDLERS,
    ...pokedexJobHandlers({ pool, sources }),
    ...(catalogFill ? catalogFillJobHandlers({ pool, sources }) : {}),
    ...(attributeFill ? attributeFillJobHandlers({ pool }) : {}),
    ...reminders.handlers,
    ...deleteAccountHandlers(pool, media?.store ?? NO_STORE),
  },
});
worker.start();
// The taxonomy build runs when the catalog differs from the stored tree (US-POK-03); `TAXONOMY_BUILD=off` stops it.
if (taxonomyBuildEnabled(process.env))
  scheduleChecks(
    () => checkTaxonomy(pool, () => new Date()),
    60 * 60 * 1000,
    (error) => console.error("taxonomy check failed", error),
  );
// First start of the catalog fill: orders the job for the approved species with gaps, then re-checks hourly (starting
// value, assumption) for species approved later. Without `CATALOG_FILL=on` nothing is ordered and no request leaves.
if (catalogFill)
  scheduleChecks(
    () => checkCatalogFill(pool, () => new Date()),
    60 * 60 * 1000,
    (error) => console.error("catalog fill check failed", error),
  );
// The attribute fill is checked hourly (starting value, assumption) for species whose source answers arrived since.
if (attributeFill)
  scheduleChecks(
    () => checkAttributeFill(pool, () => new Date()),
    60 * 60 * 1000,
    (error) => console.error("attribute fill check failed", error),
  );
// The daily reminder checks that have come due are ordered every 5 minutes (starting value, assumption); a failure is
// reported and the next tick tries again.
scheduleChecks(
  () => reminders.tick(new Date()),
  5 * 60 * 1000,
  (error) => console.error("reminder scheduling failed", error),
);
process.on("SIGTERM", () => void worker.stop().then(() => process.exit(0)));

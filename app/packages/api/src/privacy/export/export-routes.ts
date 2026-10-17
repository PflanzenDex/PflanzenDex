import { exportAccountData, type ObjectStore } from "@pflanzendex/core";
import { AccountDataPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { errorBody, statusFor, type AuthEnv } from "../../kernel";
import { NO_STORE } from "../unavailable-store";
import { zipArchive } from "./zip";

/**
 * `GET /account/export` (US-ACC-04): all data of the caller as a ZIP archive, `data.json` plus `photos/<name>`. Reads
 * only, for the account of the caller (P-04), regardless of which function groups are switched on (what is switched
 * off is still the keeper's data). The header `X-Missing-Photos` counts photos the store no longer holds; they are
 * listed in `data.json` (P-10).
 */
export function exportRoutes(pool: Pool, store: ObjectStore | undefined): Hono<AuthEnv> {
  const source = new AccountDataPostgres(pool);
  const routes = new Hono<AuthEnv>();
  routes.get("/export", async (c) => {
    const r = await exportAccountData({ source, photos: store ?? NO_STORE }, c.get("account").id);
    if (!r.ok) return c.json(errorBody(r.error), statusFor(r.error));
    const archive = zipArchive([
      { path: "data.json", bytes: Buffer.from(r.value.dataJson, "utf8") },
      ...r.value.files,
    ]);
    return c.body(archive as unknown as ArrayBuffer, 200, {
      "content-type": "application/zip",
      "content-disposition": 'attachment; filename="pflanzendex-export.zip"',
      "cache-control": "no-store",
      "x-missing-photos": String(r.value.missingPhotos),
    });
  });
  return routes;
}

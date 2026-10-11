import {
  appError,
  imageStorage,
  wishImageFile,
  wishStoreImage,
  type ImageDownload,
  type ImageProcessor,
  type ObjectStore,
  type SourceClient,
  wishBought,
  wishBuy,
  wishCandidates,
  wishCreate,
  wishDiscard,
  wishDiscarded,
  wishLinkSpecimen,
  wishRemove,
  wishRename,
  wishZoneUsage,
  type WishRow,
  type ZoneStockSource,
  type ZoneUsage,
} from "@pflanzendex/core";
import { IdempotencyPostgres, WishesPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { body, errorBody, statusFor, write, type AuthEnv } from "../kernel";

/** Paths the sign-in guard (bearer token) must cover. */
export const WISH_PATHS = ["/wishes"] as const;

/** The zone usage of the wishes for `lightRoutes`: a zone a wish points to is not deleted unnoticed (US-LIC-05). */
export function wishZoneUsageFor(pool: Pool): ZoneUsage {
  return wishZoneUsage({ wishes: new WishesPostgres(pool) });
}

/**
 * The wishlist (US-WUN-01, DM-WUN-01). Reading is a derived view: the open candidates sorted by the stock of their
 * target zone (nothing stored twice, P-01). The stock comes through the port `ZoneStockSource`, which the app root
 * wires (ADR 0003: the wishlist never reaches into the collection). Writing goes only through `wish.create` (P-03,
 * with `Idempotency-Key`). Everything is private to the account (P-04, P-05): a foreign zone looks like an unknown one.
 * Duplicate names that migration 0020 left exempt (FR-WUN-06, #303) are part of the candidate list (`duplicates`) and are
 * repaired through `wish.rename` and `wish.remove_duplicate`, which work only on wishes without a name key.
 * "Bought" (US-WUN-03) goes through `wish.buy`; the bought wishes stay readable as the history (`GET /wishes/bought`).
 * The path to the plant (US-WUN-05): `wish.link_specimen` links a bought wish to the specimen it became, `wish.discard`
 * sets an open wish to discarded; discarded wishes stay readable (`GET /wishes/discarded`, P-10).
 */
export function wishRoutes(
  pool: Pool,
  zoneStock: ZoneStockSource,
  image?: WishImageSources & { media: { store: ObjectStore; processor: ImageProcessor } },
): Hono<AuthEnv> {
  const wishes = new WishesPostgres(pool);
  const create = wishCreate({ wishes });
  const buy = wishBuy({ wishes });
  const discard = wishDiscard({ wishes });
  const link = wishLinkSpecimen({ wishes });
  const rename = wishRename({ wishes });
  const removeDuplicate = wishRemove({ wishes });
  const deps = { idempotency: new IdempotencyPostgres(pool) };
  const routes = new Hono<AuthEnv>();
  routes.get("/wishes/candidates", async (c) =>
    c.json(await wishCandidates({ wishes, stock: zoneStock }, c.get("account").id)),
  );
  routes.post("/wishes", async (c) =>
    write(c, deps, create, {
      input: await body(c),
      success: 201,
      wrapper: (wish: WishRow) => ({ wish }),
    }),
  );
  routes.get("/wishes/bought", async (c) =>
    c.json(await wishBought({ wishes }, c.get("account").id)),
  );
  routes.post("/wishes/:id/buy", async (c) =>
    write(c, deps, buy, { input: { wishId: c.req.param("id") } }),
  );
  routes.get("/wishes/discarded", async (c) =>
    c.json(await wishDiscarded({ wishes }, c.get("account").id)),
  );
  routes.post("/wishes/:id/discard", async (c) =>
    write(c, deps, discard, { input: { wishId: c.req.param("id") } }),
  );
  routes.post("/wishes/:id/specimen", async (c) =>
    write(c, deps, link, { input: { ...(await body(c)), wishId: c.req.param("id") } }),
  );
  routes.post("/wishes/:id/rename", async (c) =>
    write(c, deps, rename, { input: { ...(await body(c)), wishId: c.req.param("id") } }),
  );
  routes.post("/wishes/:id/remove-duplicate", async (c) =>
    write(c, deps, removeDuplicate, { input: { wishId: c.req.param("id") } }),
  );
  if (image) addImageRoutes(routes, wishes, deps, image);
  else addNoImageRoutes(routes);
  return routes;
}

/** What storing a wish image needs (US-WUN-04): the source client for Commons and the downloader of the original. */
export interface WishImageSources {
  readonly sources: SourceClient;
  readonly download: ImageDownload;
}

type ImageDeps = WishImageSources & { media: { store: ObjectStore; processor: ImageProcessor } };

/** `POST /wishes/:id/image` stores a local copy; `GET /wishes/:id/image` serves it to the owner only (P-05). */
function addImageRoutes(
  routes: Hono<AuthEnv>,
  wishes: WishesPostgres,
  deps: { idempotency: IdempotencyPostgres },
  image: ImageDeps,
): void {
  const store = wishStoreImage({
    wishes,
    sources: image.sources,
    download: image.download,
    storage: imageStorage(image.media),
    newName: randomUUID,
  });
  routes.post("/wishes/:id/image", async (c) =>
    write(c, deps, store, { input: { wishId: c.req.param("id") } }),
  );
  routes.get("/wishes/:id/image", async (c) => {
    const r = await wishImageFile(
      { wishes, objects: image.media.store },
      c.get("account").id,
      c.req.param("id"),
    );
    if (!r.ok) return c.json(errorBody(r.error), statusFor(r.error));
    return c.body(r.value.bytes as unknown as ArrayBuffer, 200, {
      "content-type": r.value.contentType,
      "cache-control": "private, max-age=3600",
    });
  });
}

/** Without storage or sources the image routes answer 502 `media.storage_unavailable` (the rest of the app is unaffected). */
function addNoImageRoutes(routes: Hono<AuthEnv>): void {
  const unavailable = (c: { json: (b: unknown, s: 502) => Response }) =>
    c.json(errorBody(appError("media.storage_unavailable")), 502);
  routes.post("/wishes/:id/image", unavailable);
  routes.get("/wishes/:id/image", unavailable);
}

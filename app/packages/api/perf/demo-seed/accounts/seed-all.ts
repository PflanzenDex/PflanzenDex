import type { Pool } from "pg";
import { Caller } from "../access/caller.ts";
import type { Subjects } from "../access/subjects.ts";
import { seedAnna } from "./anna.ts";
import { seedBen } from "./ben/ben.ts";
import { seedClara } from "./clara.ts";
import { befriend, ensureOffer, ensureRequest } from "./common/social.ts";
import { seedSwapHistory } from "./common/swap-history.ts";
import type { Ctx } from "./common/shared.ts";

export type SeedOptions = {
  subjects: Subjects;
  withPhotos?: boolean;
  media?: ConstructorParameters<typeof Caller>[2];
  log?: (m: string) => void;
};

/** The three demo accounts as seed contexts, all calling the API in process (shared by the states profile). */
export function demoContexts(
  pool: Pool,
  opt: SeedOptions,
): { api: Caller; anna: Ctx; ben: Ctx; clara: Ctx } {
  const log = opt.log ?? (() => undefined);
  const emails = new Map(
    Object.entries(opt.subjects).map(([user, sub]) => [sub, `${user}@example.test`]),
  );
  const api = new Caller(pool, emails, opt.media);
  const ctx = (user: keyof Subjects, name: string): Ctx => ({
    api,
    sub: opt.subjects[user],
    name,
    log,
  });
  return { api, anna: ctx("test", "Anna"), ben: ctx("test2", "Ben"), clara: ctx("test3", "Clara") };
}

/** Fills the three dev accounts (see docs/guides/reference/app.md, "Demo seed"). Safe to run again. */
export async function seedAll(pool: Pool, opt: SeedOptions): Promise<void> {
  const log = opt.log ?? (() => undefined);
  const { api, anna, ben, clara } = demoContexts(pool, opt);

  await seedAnna(anna);
  const benData = await seedBen(ben, opt.withPhotos ?? false);
  const claraData = await seedClara(clara);

  // Clara is friends with both; Ben has asked Anna, who has not answered yet (an open friend request).
  await befriend(anna, clara, true);
  await befriend(ben, clara, true);
  await befriend(anna, ben, false);

  // Offers: Ben gives a cutting away for a swap, Clara offers two cuttings; Clara asks for Ben's cutting.
  const benCutting = benData.specimens.get("Pilea peperomioides|Ableger");
  const benOffer = benCutting
    ? await ensureOffer(ben, benCutting, {
        type: "cutting",
        mode: "swap",
        wish: "Eine Hoya oder ein Philodendron",
        note: "Bewurzelt, bereit zum Eintopfen.",
      })
    : undefined;
  const claraOffers = new Map<string, string>();
  for (const key of ["Hoya carnosa|Ableger", "Tradescantia zebrina|Ableger"]) {
    const id = claraData.specimens.get(key);
    if (id) {
      await api.ok(clara.sub, "PUT", `/sharing/specimens/${id}`, { share: "friends" });
      const offer = await ensureOffer(clara, id, {
        type: "cutting",
        mode: "swap",
        wish: "Gerne etwas Seltenes",
      });
      if (offer) claraOffers.set(key, offer);
    }
  }
  const claraCounter = claraData.specimens.get("Chlorophytum comosum|Kindel") ?? null;
  if (claraCounter)
    await api.ok(clara.sub, "PUT", `/sharing/specimens/${claraCounter}`, { share: "friends" });
  if (benOffer) await ensureRequest(clara, benOffer, claraCounter);
  log("Friendships, offers and one open swap request are in place.");
  // The swap history (#943): Clara gives Anna a cutting and declines Anna's request for her Hoya cutting.
  const hoyaOffer = claraOffers.get("Hoya carnosa|Ableger");
  if (hoyaOffer) await seedSwapHistory(clara, anna, hoyaOffer);
}

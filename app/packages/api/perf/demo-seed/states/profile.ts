import type { Pool } from "pg";
import type { Subjects } from "../access/subjects.ts";
import { demoContexts } from "../accounts/seed-all.ts";
import {
  etiolatedToday,
  longSeries,
  anniversary,
  locationWithoutZone,
  specimenWithoutLocation,
  treatmentDueToday,
} from "./steps/care.ts";
import { benGear } from "./steps/gear.ts";
import { grantRoles, operatorArea, reviewCases } from "./steps/people.ts";
import { claraWishes } from "./steps/wishes.ts";
import { annaOffer, benMoosstabOffer, declineBen, friendNews, swapStates } from "./steps/social.ts";

export const PROFILES = ["base", "states"] as const;
export type Profile = (typeof PROFILES)[number];

export type StatesOptions = { subjects: Subjects; log?: (message: string) => void };

/**
 * The opt-in states profile (US-DEV-01, owner decision 2026-10-30): runs after the base seed on the same three accounts
 * and adds the feature states the base seed does not show (roles, review cases, friend and swap states, match cards,
 * wishlist history and hints, equipment states, measurement states, achievements, operator area, care states). Every
 * write goes through the API of the acting account (the same operations the app calls, row rules apply). Safe to run
 * again: each step looks at the current state first. The mapping of states to accounts and screens is states/states-map.md.
 * Not covered here (listed as manual steps there): the fresh-account states, AI client states, the deletion request, photos.
 */
export async function seedStates(pool: Pool, opt: StatesOptions): Promise<void> {
  const log = opt.log ?? (() => undefined);
  const { anna, ben, clara } = demoContexts(pool, { subjects: opt.subjects, log });
  await grantRoles(pool, clara.sub);
  await operatorArea(clara);
  await reviewCases(ben, clara);
  await claraWishes(clara);
  await declineBen(anna);
  await friendNews(anna, clara);
  await annaOffer(anna);
  await benMoosstabOffer(ben);
  await swapStates(ben, clara);
  await benGear(ben);
  await etiolatedToday(ben);
  await longSeries(clara);
  await treatmentDueToday(ben);
  await anniversary(ben);
  await locationWithoutZone(ben);
  await specimenWithoutLocation(clara);
  log(
    "States profile in place: roles, review cases, wishes, friends, swaps, equipment, measurements, care.",
  );
}

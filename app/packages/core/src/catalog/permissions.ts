import { type SignedInContext } from "../kernel";
import type { ReviewStore } from "./types";

/** A reviewer is whoever is operator or reviewer (FR-BES-14). Without a role only proposing remains. */
export const isReviewer =
  (store: ReviewStore) =>
  async (context: SignedInContext): Promise<boolean> =>
    (await store.roles(context.userId)).length > 0;

import { appError, failed, ok, type Result } from "../kernel";
import { checkApprovalReadiness, type ApprovalIssue } from "./approval";
import { normalize, type Species, type SpeciesStore } from "./species";
import { OPEN, type ReviewCase, type ReviewStore } from "./types";

/** An existing approved species that looks like the proposal (duplicate hint, US-BES-10). */
export interface SimilarSpecies {
  readonly id: string;
  readonly latinName: string;
  readonly matchedOn: string;
}

export interface ReviewEntry {
  readonly reviewCase: ReviewCase;
  /** The proposed profile; `null` for kinds other than species or if the content is gone. */
  readonly species: Species | null;
  /** AI-created and not yet reviewed by a human (FR-BES-06). */
  readonly aiCreated: boolean;
  /** Why it cannot be approved yet (missing fields, missing source). */
  readonly issues: readonly ApprovalIssue[];
  readonly similar: readonly SimilarSpecies[];
}

export interface ReviewList {
  /** Number of open proposals (the operator's weekly routine, US-DEV-03). */
  readonly open: number;
  /** Creation time of the oldest open proposal, `null` if none; the age is derived from it, never stored. */
  readonly oldestOpenAt: string | null;
  readonly entries: readonly ReviewEntry[];
}

async function similarTo(species: SpeciesStore, userId: string, s: Species) {
  const keys = new Set([s.latinName, ...s.synonyms].map(normalize).filter((n) => n !== ""));
  const found = new Map<string, SimilarSpecies>();
  for (const key of keys) {
    for (const hit of await species.search(userId, key)) {
      const approved = hit.reviewStatus === "curated" || hit.reviewStatus === "reviewed";
      if (approved && hit.id !== s.id && hit.hit && !found.has(hit.id)) {
        found.set(hit.id, { id: hit.id, latinName: hit.latinName, matchedOn: hit.hit.display });
      }
    }
  }
  return [...found.values()];
}

/**
 * The review list (US-BES-10): open user proposals and operator batches, per entry the problems that block approval
 * and the existing species it may duplicate. A read, so a plain function, not an operation. Reviewers only (P-04: a
 * plant keeper never sees foreign proposals).
 */
export async function catalogList(
  store: ReviewStore,
  species: SpeciesStore,
  userId: string | null,
): Promise<Result<ReviewList>> {
  if (userId === null) return failed(appError("access.not_signed_in"));
  if ((await store.roles(userId)).length === 0) return failed(appError("access.denied"));
  const cases = await store.listForReview(userId);
  const entries = await Promise.all(
    cases.map(async (reviewCase): Promise<ReviewEntry> => {
      const content =
        reviewCase.objectKind === "species"
          ? await species.findForReview(userId, reviewCase.objectId)
          : null;
      const open = OPEN.includes(reviewCase.status);
      return {
        reviewCase,
        species: content,
        aiCreated: reviewCase.status === "ai_unreviewed",
        issues: content && open ? checkApprovalReadiness(content) : [],
        similar: content && open ? await similarTo(species, userId, content) : [],
      };
    }),
  );
  const stillOpen = cases.filter((c) => OPEN.includes(c.status));
  const oldest = stillOpen.map((c) => c.createdAt).sort()[0] ?? null;
  return ok({ open: stillOpen.length, oldestOpenAt: oldest, entries });
}

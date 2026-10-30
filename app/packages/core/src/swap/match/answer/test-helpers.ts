import type { MatchAnswers, StoredMatchAnswer } from "./types";

/** In-memory answers for tests only; the real adapter lives in `db`. Every account has its own list (P-04). */
export class InMemoryMatchAnswers implements MatchAnswers {
  readonly rows: Record<string, Map<string, StoredMatchAnswer>> = {};

  private of(userId: string) {
    return (this.rows[userId] ??= new Map());
  }

  async list(userId: string) {
    return [...this.of(userId).values()];
  }

  async save(userId: string, v: Parameters<MatchAnswers["save"]>[1]) {
    this.of(userId).set(v.offerId, {
      offerId: v.offerId,
      answer: v.answer,
      answeredOn: v.answeredOn,
      speciesLatin: v.speciesLatin,
      speciesGerman: v.speciesGerman,
      giverName: v.giverName,
    });
  }

  async remove(userId: string, offerId: string) {
    return this.of(userId).delete(offerId);
  }
}

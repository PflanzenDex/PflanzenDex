import type {
  HandoverContext,
  HandoverSpecimen,
  HandoverSteps,
  HandoverStore,
  ReceiveRefusal,
} from "./ports";

const specimen = (extra: Partial<HandoverSpecimen> = {}): HandoverSpecimen => ({
  id: "g1",
  speciesId: "sp1",
  name: "Aloe vera",
  marker: null,
  locationId: "loc-giver",
  status: "plant",
  caughtAt: "2026-01-01",
  createdAt: null,
  archivedAt: null,
  archivedReason: null,
  ...extra,
});
export { specimen as handoverSpecimen };

/**
 * In-memory handover for tests only: it plays the transaction (writes are applied only on commit) and the two sides'
 * confirmations. `refuseReceive` makes the creation of the new specimen fail like a taken name.
 */
export class InMemoryHandover implements HandoverStore {
  confirmed = { giver: false, recipient: false };
  marker: string | null = null;
  status: "accepted" | "handed_over" = "accepted";
  outcome: HandoverContext["outcome"] = "ok";
  refuseReceive: ReceiveRefusal | null = null;
  readonly archived: { giver: string; id: string; reason: string; date: string }[] = [];
  readonly created: {
    recipient: string;
    values: Record<string, unknown>;
    assignments: unknown[];
  }[] = [];
  finished: { given: string; received: string } | null = null;
  recipientHas: HandoverSpecimen[] = [];
  giverHas: HandoverSpecimen | null = specimen();
  commits = 0;
  rollbacks = 0;

  constructor(
    private readonly sides: {
      giver: string;
      recipient: string;
      mode: "swap" | "give_away";
      type: "cutting" | "plant" | "offshoot";
    },
  ) {}

  async handover<T>(
    userId: string,
    work: (steps: HandoverSteps) => Promise<{ commit: boolean; value: T }>,
  ) {
    const before = { confirmed: { ...this.confirmed }, marker: this.marker, status: this.status };
    const pending: (() => void)[] = [];
    const role = userId === this.sides.giver ? "giver" : "recipient";
    const steps: HandoverSteps = {
      confirm: async (_swap, marker) => {
        if (this.outcome === "ok") {
          this.confirmed[role] = true;
          if (role === "recipient" && marker) this.marker = marker;
        }
        return {
          outcome: this.outcome,
          both: this.confirmed.giver && this.confirmed.recipient,
          role,
          otherId: role === "giver" ? this.sides.recipient : this.sides.giver,
          offerId: "offer-1",
          specimenId: "g1",
          type: this.sides.type,
          marker: this.marker,
          mode: this.sides.mode,
          otherName: "Ben",
        };
      },
      giverSpecimen: async () => this.giverHas,
      recipientSpecimens: async () => this.recipientHas,
      archiveGiven: async (giver, id, reason, date) => {
        pending.push(() => this.archived.push({ giver, id, reason, date }));
        return specimen({ status: "archived" });
      },
      createReceived: async (recipient, values, assignments) => {
        if (this.refuseReceive) throw new Refusal(this.refuseReceive);
        pending.push(() => this.created.push({ recipient, values, assignments: [...assignments] }));
        return specimen({ id: "r1", name: values.name });
      },
      finish: async (_swap, given, received) => {
        pending.push(() => {
          this.finished = { given, received };
          this.status = "handed_over";
        });
        return true;
      },
    };
    try {
      const r = await work(steps);
      if (!r.commit) throw new Rollback(r.value);
      pending.forEach((f) => f());
      this.commits += 1;
      return r.value;
    } catch (e) {
      this.rollbacks += 1;
      this.confirmed = before.confirmed;
      this.marker = before.marker;
      if (e instanceof Refusal) return { refused: e.reason };
      if (e instanceof Rollback) return e.value as T;
      throw e;
    }
  }
}

class Refusal extends Error {
  constructor(readonly reason: ReceiveRefusal) {
    super(reason);
  }
}
class Rollback extends Error {
  constructor(readonly value: unknown) {
    super("rollback");
  }
}

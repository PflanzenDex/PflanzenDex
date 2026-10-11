import type { Pool, PoolClient } from "pg";
import {
  archiveSpecimenOn,
  createSpecimenOn,
  findSpecimenOn,
  listSpecimensOn,
  SpeciesGone,
  type NewSpecimen,
  type SpecimenRow,
} from "../collection/index.ts";
import { asAccount } from "../kernel/index.ts";

// Same shapes as the interfaces in `core` (structurally equal; `db` does not import `core`).
export type HandoverOutcome =
  "ok" | "not_found" | "wrong_state" | "already_handed_over" | "friendship_ended";

/** What `confirm_handover()` answers: the state and what the application needs for the collection work. */
export interface HandoverContext {
  readonly outcome: HandoverOutcome;
  /** Both sides have confirmed: this confirmation completes the handover. */
  readonly both: boolean;
  readonly role: "giver" | "recipient" | null;
  readonly otherId: string | null;
  readonly offerId: string | null;
  /** The specimen offered (the giver's). */
  readonly specimenId: string | null;
  readonly type: "cutting" | "plant" | "offshoot" | null;
  /** The marker the recipient chose for the new specimen. */
  readonly marker: string | null;
  readonly mode: "swap" | "give_away" | null;
  /** The name of the other side as stored when the request was made; `null` = it has none (P-08). */
  readonly otherName: string | null;
}

export type ReceiveRefusal = "name_taken" | "marker_taken" | "species_unknown";

/** Thrown inside the transaction when a step is refused: the transaction is rolled back, the swap stays as it was. */
class Refused extends Error {
  constructor(readonly reason: ReceiveRefusal | "specimen_gone") {
    super(reason);
  }
}

const UNIQUE = "23505";
const FOREIGN_KEY = "23503";

/**
 * The steps of a handover inside one transaction (ADR 0012, FR-SOZ-05): the confirmation, the giver's specimen read and
 * archived as the giver, the recipient's specimens read and the new one created as the recipient (`asAccount`), and the
 * completion of both swap rows. Everything runs on the connection of the caller; a refused step rolls the whole
 * transaction back, so the swap stays `accepted` and nothing is half done. Only `core` decides what the steps mean.
 */
export class HandoverSession {
  constructor(private readonly c: PoolClient) {}

  /** Records my confirmation (and the marker, for the recipient) on both rows. */
  async confirm(swapId: string, marker: string | null): Promise<HandoverContext> {
    const r = await this.c.query<HandoverContext>(
      `select outcome, all_done as "both", role, other_id as "otherId", offer_id as "offerId", specimen_id as "specimenId", type, marker, mode, other_name as "otherName"
         from confirm_handover($1, $2)`,
      [swapId, marker],
    );
    return r.rows[0] as HandoverContext;
  }

  /** The offered specimen, read as the giver. */
  giverSpecimen(giver: string, specimenId: string): Promise<SpecimenRow | null> {
    return asAccount(this.c, giver, () => findSpecimenOn(this.c, specimenId));
  }

  /** The specimens of the recipient, read as the recipient (for the naming rule of the new one). */
  recipientSpecimens(recipient: string): Promise<readonly SpecimenRow[]> {
    return asAccount(this.c, recipient, () => listSpecimensOn(this.c));
  }

  /** Archives the given specimen as the giver; a specimen that is gone or archived already refuses the handover. */
  async archiveGiven(
    giver: string,
    specimenId: string,
    reason: string,
    date: string,
  ): Promise<SpecimenRow> {
    const row = await asAccount(this.c, giver, () =>
      archiveSpecimenOn(this.c, specimenId, reason, date),
    );
    if (!row) throw new Refused("specimen_gone");
    return row;
  }

  /** Creates the received specimen as the recipient; a taken name or marker or a vanished species refuses the handover. */
  async createReceived(
    recipient: string,
    values: NewSpecimen,
    assignments: readonly { specimenId: string; name: string; marker: string }[],
  ): Promise<SpecimenRow> {
    try {
      return await asAccount(this.c, recipient, () =>
        createSpecimenOn(this.c, recipient, values, assignments),
      );
    } catch (e) {
      if (e instanceof SpeciesGone) throw new Refused("species_unknown");
      if (
        (e as { code?: string }).code === FOREIGN_KEY &&
        (e as { constraint?: string }).constraint === "specimen_species"
      )
        throw new Refused("species_unknown");
      const f = e as { code?: string; constraint?: string };
      if (f.code === UNIQUE && f.constraint === "specimen_name_per_account")
        throw new Refused("name_taken");
      if (f.code === UNIQUE && f.constraint === "specimen_marker_per_species")
        throw new Refused("marker_taken");
      throw e;
    }
  }

  /** Moves both rows to `handed_over` and records the specimens; `false` if the swap is not an accepted, confirmed one. */
  async finish(swapId: string, given: string, received: string): Promise<boolean> {
    const r = await this.c.query<{ ok: boolean }>("select finish_handover($1, $2, $3) as ok", [
      swapId,
      given,
      received,
    ]);
    return r.rows[0]?.ok === true;
  }
}

/** Opens the transaction of a handover as the caller; `work` decides whether it is committed. */
export async function runHandover<T>(
  pool: Pool,
  userId: string,
  work: (session: HandoverSession) => Promise<{ readonly commit: boolean; readonly value: T }>,
): Promise<T | { readonly refused: ReceiveRefusal | "specimen_gone" }> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role pflanzendex_app");
    await client.query("select set_config('app.account_id', $1, true)", [userId]);
    const r = await work(new HandoverSession(client));
    await client.query(r.commit ? "commit" : "rollback");
    return r.value;
  } catch (e) {
    await client.query("rollback");
    if (e instanceof Refused) return { refused: e.reason };
    throw e;
  } finally {
    client.release();
  }
}

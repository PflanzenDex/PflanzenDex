import type { Pool } from "pg";
import { withAccount } from "../../kernel/index.ts";

// Shapes of `core` (type-only import through its public entry, AB-2).
import type {
  Correction,
  CorrectionEntry,
  CorrectionField,
  CorrectionStore,
  FieldVersion,
} from "@pflanzendex/core";

const COLUMN: Record<CorrectionField, string> = {
  familyLatin: "family_latin",
  germanName: "german_name",
  botanicalStory: "botanical_story",
};
const FIELD = Object.fromEntries(Object.entries(COLUMN).map(([k, v]) => [v, k])) as Record<
  string,
  CorrectionField
>;
const UNIQUE_VIOLATION = "23505";
const ISO = (column: string) =>
  `to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

interface Row {
  id: string;
  speciesId: string;
  latinName: string;
  field: string;
  oldValue: string | null;
  proposedValue: string;
  reason: string;
  source: string | null;
  status: Correction["status"];
  createdAt: string;
  decidedAt: string | null;
  decisionReason: string | null;
}
const COLUMNS = `k.id, k.species_id as "speciesId", s.latin_name as "latinName", k.field,
  k.old_value as "oldValue", k.proposed_value as "proposedValue", k.reason, k.source, k.status,
  ${ISO("k.created_at")} as "createdAt", ${ISO("k.decided_at")} as "decidedAt", k.decision_reason as "decisionReason"`;
const toCorrection = (r: Row): Correction => ({ ...r, field: FIELD[r.field] as CorrectionField });

/**
 * Database side of the corrections (US-BES-16). Proposals are plain inserts under the row rule of the creator; accept,
 * reject and revert are database functions that check the reviewer role themselves (the application role cannot write
 * `species`), so a hand-made statement cannot decide either (P-03, P-04).
 */
export class CorrectionPostgres implements CorrectionStore {
  constructor(private readonly pool: Pool) {}

  async speciesValue(userId: string, speciesId: string, field: CorrectionField) {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<{ latin_name: string; value: string | null; status: string | null }>(
        `select latin_name, ${COLUMN[field]} as value, species_status(id) as status from species where id = $1`,
        [speciesId],
      ),
    );
    const row = r.rows[0];
    if (!row || (row.status !== "curated" && row.status !== "reviewed")) return null;
    return { latinName: row.latin_name, value: row.value };
  }

  async create(userId: string, v: Parameters<CorrectionStore["create"]>[1]) {
    try {
      const r = await withAccount(this.pool, userId, async (c) => {
        const ins = await c.query<{ id: string }>(
          `insert into catalog_correction (account_id, species_id, field, proposed_value, reason, source)
           values ($1, $2, $3, $4, $5, $6) returning id`,
          [userId, v.speciesId, COLUMN[v.field], v.proposedValue, v.reason, v.source],
        );
        const rows = await c.query<Row>(
          `select ${COLUMNS} from catalog_correction k join species s on s.id = k.species_id where k.id = $1`,
          [ins.rows[0]?.id],
        );
        return rows.rows[0] as Row;
      });
      return toCorrection(r);
    } catch (e) {
      if ((e as { code?: string }).code !== UNIQUE_VIOLATION) throw e;
      // The open correction of somebody else is not readable under the row rule; the id is the proof it exists.
      const dup = await withAccount(this.pool, userId, (c) =>
        c.query<{ id: string }>("select open_correction_id($1, $2, $3) as id", [
          v.speciesId,
          COLUMN[v.field],
          v.proposedValue,
        ]),
      );
      return { duplicate: dup.rows[0]?.id ?? "" };
    }
  }

  async listOpen(userId: string): Promise<readonly CorrectionEntry[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<Row & { currentValue: string | null }>(
        `select id, species_id as "speciesId", latin_name as "latinName", field, old_value as "oldValue",
                proposed_value as "proposedValue", reason, source, status,
                ${ISO("created_at")} as "createdAt", ${ISO("decided_at")} as "decidedAt",
                decision_reason as "decisionReason", current_value as "currentValue"
           from open_catalog_corrections()`,
      ),
    );
    return r.rows.map((x) => ({ ...toCorrection(x), currentValue: x.currentValue }));
  }

  async listMine(userId: string): Promise<readonly Correction[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<Row>(
        `select ${COLUMNS} from catalog_correction k join species s on s.id = k.species_id
          where k.account_id = $1 order by k.created_at desc, k.id`,
        [userId],
      ),
    );
    return r.rows.map(toCorrection);
  }

  async accept(userId: string, id: string) {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<{ outcome: string; version: number | null }>(
        "select outcome, version from accept_catalog_correction($1)",
        [id],
      ),
    );
    const row = r.rows[0];
    if (row?.outcome === "accepted" && row.version !== null) return { version: row.version };
    return row?.outcome === "decided" ? ("decided" as const) : ("not_found" as const);
  }

  async reject(userId: string, id: string, reason: string) {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<{ outcome: string }>("select reject_catalog_correction($1, $2) as outcome", [
        id,
        reason,
      ]),
    );
    const outcome = r.rows[0]?.outcome;
    return outcome === "rejected" || outcome === "decided" ? outcome : ("not_found" as const);
  }

  async history(userId: string, speciesId: string, field: CorrectionField) {
    return withAccount(this.pool, userId, async (c) => {
      const visible = await c.query("select 1 from species where id = $1", [speciesId]);
      if (visible.rowCount === 0) return null;
      const r = await c.query<{
        version: number;
        value: string;
        origin: FieldVersion["origin"];
        source: string | null;
        link: string | null;
        license: string | null;
        retrievedOn: string | null;
        citation: string | null;
        disputed: boolean;
        setAt: string;
        setBy: string | null;
      }>(
        `select version, value, origin, source, link, license, to_char(retrieved_on, 'YYYY-MM-DD') as "retrievedOn",
                citation, disputed, ${ISO("set_at")} as "setAt", set_by as "setBy"
           from catalog_field_provenance where species_id = $1 and field = $2 order by version desc`,
        [speciesId, COLUMN[field]],
      );
      return r.rows.map((x): FieldVersion => ({
        version: x.version,
        value: x.value,
        origin: x.origin,
        source:
          x.source && x.link && x.license && x.retrievedOn
            ? { name: x.source, link: x.link, license: x.license, retrievedOn: x.retrievedOn }
            : null,
        citation: x.citation,
        disputed: x.disputed,
        setAt: x.setAt,
        setBy: x.setBy,
      }));
    });
  }

  async revert(userId: string, speciesId: string, field: CorrectionField, version: number) {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<{ outcome: string; version: number | null }>(
        "select outcome, version from revert_catalog_field($1, $2, $3)",
        [speciesId, COLUMN[field], version],
      ),
    );
    const row = r.rows[0];
    if (row?.outcome === "reverted" && row.version !== null) return { version: row.version };
    return row?.outcome === "unchanged" ? ("unchanged" as const) : ("not_found" as const);
  }
}

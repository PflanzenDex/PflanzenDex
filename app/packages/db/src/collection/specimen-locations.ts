import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";
import { COLUMNS, FOREIGN_KEY, pgError, type SpecimenRow } from "./specimen-shared.ts";

/** A specimen was refused: the transaction is undone and the reason goes back to the caller. */
class Refused extends Error {
  constructor(readonly reason: "archived" | "specimen_unknown") {
    super(reason);
  }
}

/**
 * All or nothing in one transaction (US-PHA-03): sets the location of each active specimen. A specimen that is
 * unknown, foreign (invisible to the row rule) or archived undoes the whole call; a location of another account
 * violates the composite foreign key (account_id, location_id). Setting the location a specimen already has just
 * writes the same value again.
 */
export async function setLocations(
  pool: Pool,
  userId: string,
  assignments: readonly { readonly specimenId: string; readonly locationId: string }[],
): Promise<readonly SpecimenRow[] | "specimen_unknown" | "archived" | "location_unknown"> {
  try {
    return await withAccount(pool, userId, async (c) => {
      const rows: SpecimenRow[] = [];
      for (const a of assignments) {
        const r = await c.query<SpecimenRow>(
          `update specimen set location_id = $2 where id = $1 and status <> 'archived'
           returning ${COLUMNS}`,
          [a.specimenId, a.locationId],
        );
        if (r.rows[0]) rows.push(r.rows[0]);
        else {
          const da = await c.query("select 1 from specimen where id = $1", [a.specimenId]);
          throw new Refused(da.rowCount ? "archived" : "specimen_unknown");
        }
      }
      return rows;
    });
  } catch (e) {
    if (e instanceof Refused) return e.reason;
    if (pgError(e).code === FOREIGN_KEY && pgError(e).constraint === "specimen_location")
      return "location_unknown";
    throw e;
  }
}

/**
 * One statement (US-LIC-02): sets or clears the own light zone of one active specimen. A zone of another account
 * violates the composite foreign key (`zone_unknown`, P-04); an archived specimen stays unchanged; a foreign one is
 * invisible to the row rule (`not_found`). Setting the same zone again just writes the same value.
 */
export async function setLightZone(
  pool: Pool,
  userId: string,
  id: string,
  lightZoneId: string | null,
): Promise<SpecimenRow | "not_found" | "archived" | "zone_unknown"> {
  try {
    return await withAccount(pool, userId, async (c) => {
      const r = await c.query<SpecimenRow>(
        `update specimen set light_zone_id = $2 where id = $1 and status <> 'archived' returning ${COLUMNS}`,
        [id, lightZoneId],
      );
      if (r.rows[0]) return r.rows[0];
      const there = await c.query("select 1 from specimen where id = $1", [id]);
      return there.rowCount ? "archived" : "not_found";
    });
  } catch (e) {
    if (pgError(e).code === FOREIGN_KEY && pgError(e).constraint === "specimen_light_zone")
      return "zone_unknown";
    throw e;
  }
}

/** The specimens that stand in the zone by their own field (port "zone usage", US-LIC-05): a zone in use is not deleted unnoticed. */
export async function zoneUsers(
  pool: Pool,
  userId: string,
  lightZoneId: string,
): Promise<readonly { kind: "specimen"; id: string; name: string }[]> {
  const r = await withAccount(pool, userId, (c) =>
    c.query<{ kind: "specimen"; id: string; name: string }>(
      `select 'specimen' as kind, id, name from specimen where light_zone_id = $1 order by lower(name)`,
      [lightZoneId],
    ),
  );
  return r.rows;
}

/**
 * What the unlock rules read of the specimens (NFR-12, US-ONB-04): the active count and the instant of the first
 * specimen ever created, archived ones included (history stays), in one row instead of the whole list. `created_at` is
 * not null (migration 0007), so every specimen has a creation date. Runs as the account of the caller (P-04); writes
 * nothing.
 */
export async function unlockSummaryOf(
  pool: Pool,
  userId: string,
): Promise<{ active: number; firstCreatedAt: string | null }> {
  const r = await withAccount(pool, userId, (c) =>
    c.query<{ active: number; firstCreatedAt: string | null }>(
      `select count(*) filter (where status <> 'archived')::int as active,
              to_char(min(created_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "firstCreatedAt"
         from specimen`,
    ),
  );
  return r.rows[0] ?? { active: 0, firstCreatedAt: null };
}

/** Filter of the card list (FR-BES-23): active, optionally at one location or without one, optionally one species. */
const CARD_FILTER = `status <> 'archived'
  and ($1::uuid is null or location_id = $1::uuid)
  and ($2::boolean is false or location_id is null)
  and ($3::uuid is null or species_id = $3::uuid)`;

/**
 * One keyset page of the active specimens with the total of its filter (US-BES-06, FR-BES-23), in one transaction. Order
 * `lower(name)`, then `id`; the cursor row is compared by value, never looked up, so an archived one still works.
 * `location`: a location ID, `none` for plants without one, or null. Writes nothing; foreign rows are invisible (P-04).
 */
export async function specimenPage(
  pool: Pool,
  userId: string,
  q: {
    readonly limit: number;
    readonly after: { readonly name: string; readonly id: string } | null;
    readonly location: string | "none" | null;
    readonly species: string | null;
  },
): Promise<{ rows: SpecimenRow[]; more: boolean; total: number }> {
  const filter = [q.location === "none" ? null : q.location, q.location === "none", q.species];
  return withAccount(pool, userId, async (c) => {
    const rows = await c.query<SpecimenRow>(
      `select ${COLUMNS} from specimen where ${CARD_FILTER}
         and ($4::text is null or (lower(name), id) > (lower($4::text), $5::uuid))
       order by lower(name), id limit $6`,
      [...filter, q.after?.name ?? null, q.after?.id ?? null, q.limit + 1],
    );
    const total = await c.query<{ total: number }>(
      `select count(*)::int as total from specimen where ${CARD_FILTER}`,
      filter,
    );
    return {
      rows: rows.rows.slice(0, q.limit),
      more: rows.rows.length > q.limit,
      total: total.rows[0]?.total ?? 0,
    };
  });
}

/**
 * Counts over all active specimens (US-BES-06 summary): aggregates only. `lastLocationId`: the place of the plant with the
 * latest catch date that has one (the add-plant rule; undated plants count as the oldest). Names are resolved by `core`.
 */
export async function specimenCounts(pool: Pool, userId: string) {
  return withAccount(pool, userId, async (c) => {
    const totals = await c.query<{ total: number; unplaced: boolean }>(
      `select count(*) filter (where status <> 'archived')::int as total,
              coalesce(bool_or(location_id is null) filter (where status <> 'archived'), false) as unplaced
         from specimen`,
    );
    const groups = await c.query<{ locationId: string; count: number }>(
      `select location_id as "locationId", count(*)::int as count from specimen
        where status <> 'archived' and location_id is not null group by location_id`,
    );
    const last = await c.query<{ locationId: string }>(
      `select location_id as "locationId" from specimen where status <> 'archived' and location_id is not null
        order by coalesce(to_char(caught_at, 'YYYY-MM-DD'), '') desc, lower(name) desc, id desc limit 1`,
    );
    const t = totals.rows[0] ?? { total: 0, unplaced: false };
    return { ...t, groups: groups.rows, lastLocationId: last.rows[0]?.locationId ?? null };
  });
}

/** Whether one of the given specimens of the account is active (US-BES-06 summary); foreign IDs match nothing (P-04). */
export async function specimenAnyActive(
  pool: Pool,
  userId: string,
  specimenIds: readonly string[],
): Promise<boolean> {
  if (specimenIds.length === 0) return false;
  const r = await withAccount(pool, userId, (c) =>
    c.query<{ active: boolean }>(
      `select exists (select 1 from specimen where id = any($1::uuid[]) and status <> 'archived') as active`,
      [specimenIds],
    ),
  );
  return r.rows[0]?.active ?? false;
}

/** Every active specimen with its place ID or null, cuttings included, for the treatment form (US-BEH-01). */
export async function treatableSpecimens(pool: Pool, userId: string) {
  const r = await withAccount(pool, userId, (c) =>
    c.query<{ id: string; name: string; locationId: string | null }>(
      `select id, name, location_id as "locationId" from specimen where status <> 'archived' order by lower(name), id`,
    ),
  );
  return r.rows;
}

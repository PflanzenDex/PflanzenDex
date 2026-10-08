import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findMissingIndexes, scan } from "./check-db-indexes.mjs";
import { compareBaseline, toBaseline } from "./db-indexes-baseline.mjs";
import { replay } from "./db-indexes-schema.mjs";

const targets = (...sql) => findMissingIndexes(replay(sql)).map((f) => `${f.table}: ${f.target}`);

const PARENT =
  "create table account (id uuid primary key); create table species (id uuid primary key);";

describe("db index gate (US-QG-07)", () => {
  it("flags a foreign key and a tenant column without an index", () => {
    const sql = `${PARENT} create table pot (id uuid primary key, account_id uuid references account(id), species_id uuid references species(id));`;
    assert.deepEqual(targets(sql), [
      "pot: account_id",
      "pot: fk(account_id)",
      "pot: fk(species_id)",
    ]);
  });

  it("accepts the leading column of an index, a primary key and a unique constraint", () => {
    const sql = `${PARENT}
      create table pot (id uuid primary key, account_id uuid references account(id), species_id uuid references species(id));
      create index pot_account on pot (account_id, id);
      create index pot_species on pot (species_id);
      create table link (account_id uuid references account(id), species_id uuid, primary key (account_id, species_id));
      create table tag (account_id uuid references account(id), name text, unique (account_id, name));`;
    assert.deepEqual(targets(sql), []);
  });

  it("needs the foreign key columns first: a trailing column does not cover", () => {
    const sql = `${PARENT} create table pot (id uuid primary key, account_id uuid references account(id), species_id uuid references species(id));
      create index pot_account_species on pot (account_id, species_id);`;
    assert.deepEqual(targets(sql), ["pot: fk(species_id)"]);
  });

  it("checks a composite (account_id, x) key as a whole", () => {
    const sql = `create table zone (account_id uuid, id uuid, unique (account_id, id));
      create table spot (account_id uuid, zone_id uuid, foreign key (account_id, zone_id) references zone (account_id, id));
      create index spot_account on spot (account_id);`;
    assert.deepEqual(targets(sql), ["spot: fk(account_id, zone_id)"]);
    assert.deepEqual(targets(`${sql} create index spot_zone on spot (zone_id, account_id);`), []);
  });

  it("does not count a partial index or an expression as covering", () => {
    const sql = `${PARENT} create table pot (id uuid primary key, species_id uuid references species(id), name text);
      create index pot_open on pot (species_id) where name is not null;`;
    assert.deepEqual(targets(sql), ["pot: fk(species_id)"]);
    const lower = `create table t (account_id uuid, name text); create unique index t_name on t (lower(name), account_id);`;
    assert.deepEqual(targets(lower), ["t: account_id"]);
  });

  it("follows renames, drops and later additions", () => {
    const sql = `${PARENT} create table pot (id uuid primary key, konto uuid references account(id));
      alter table pot rename column konto to account_id;
      alter table pot rename to jar;
      create index jar_account on jar (account_id);
      alter table jar add column species_id uuid references species(id);
      alter table jar add constraint jar_x foreign key (id) references species (id);
      alter table jar drop constraint jar_x;`;
    assert.deepEqual(targets(sql), ["jar: fk(species_id)"]);
    assert.deepEqual(targets(`${sql} drop index jar_account;`), [
      "jar: account_id",
      "jar: fk(account_id)",
      "jar: fk(species_id)",
    ]);
  });

  it("ignores comments, string literals and function bodies", () => {
    const sql = `-- create table ghost (account_id uuid);
      create table t (id uuid primary key, note text default 'create index; --');
      create function f() returns void language sql as $$ create table inner_t (account_id uuid); $$;`;
    assert.deepEqual(targets(sql), []);
  });

  it("the baseline must name every finding, shrink, and not grow", () => {
    const findings = [{ table: "pot", target: "account_id" }];
    assert.deepEqual(toBaseline(findings), { pot: ["account_id"] });
    assert.deepEqual(compareBaseline(findings, { pot: ["account_id"] }), []);
    assert.match(compareBaseline(findings, {})[0], /new violations are not allowed/);
    assert.match(compareBaseline([], { pot: ["account_id"] })[0], /delete the baseline entry/);
    assert.match(
      compareBaseline(findings, { pot: ["account_id"] }, {})[0],
      /not in the baseline on dev/,
    );
  });

  it("the migrations of this repo are in line with findings-baseline.json", () => {
    assert.ok(scan().length > 0, "the replay finds the known gaps (US-QG-07 baseline)");
  });
});

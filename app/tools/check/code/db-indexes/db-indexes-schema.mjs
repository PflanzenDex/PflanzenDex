// Replays the migrations into a small model per table (US-QG-07): columns, foreign keys, and everything that works as an
// index (indexes, primary keys, unique constraints). Only what the gate needs is modelled; the rest is skipped.
import { leadingColumns, parenGroup, splitTop, statements } from "./db-indexes-sql.mjs";

const NAME = "[a-z_]\\w*";
const newTable = () => ({ columns: new Set(), keys: new Map(), indexes: new Map() });
// A key is { kind: "pk" | "unique" | "fk", cols, partial }; indexes are { cols, partial } (cols = leading plain columns).

function addKey(table, name, key) {
  table.keys.set(name, key);
}

/** Registers a primary key, unique or foreign key from the text after `primary key` / `unique` / `foreign key`. */
function addConstraint(t, tableName, name, text) {
  const kind = text.startsWith("primary key")
    ? "pk"
    : text.startsWith("unique")
      ? "unique"
      : text.startsWith("foreign key")
        ? "fk"
        : null;
  if (!kind) return;
  const cols = parenGroup(text)
    .inner.split(",")
    .map((c) => c.trim());
  const suffix = { pk: "pkey", unique: "key", fk: "fkey" }[kind];
  const byDefault =
    kind === "pk" ? `${tableName}_pkey` : `${tableName}_${cols.join("_")}_${suffix}`;
  addKey(t, name ?? byDefault, { kind, cols });
}

function constraintItem(t, tableName, item) {
  const named = item.match(new RegExp(`^constraint (${NAME}) (.*)$`));
  addConstraint(t, tableName, named?.[1], named?.[2] ?? item);
}

function addColumn(t, tableName, def) {
  const m = def.match(new RegExp(`^(?:if not exists )?(${NAME}) (.*)$`));
  if (!m) return;
  const [, col, rest] = m;
  t.columns.add(col);
  if (/\bprimary key\b/.test(rest)) addKey(t, `${tableName}_pkey`, { kind: "pk", cols: [col] });
  if (/\bunique\b/.test(rest))
    addKey(t, `${tableName}_${col}_key`, { kind: "unique", cols: [col] });
  if (/\breferences\b/.test(rest))
    addKey(t, `${tableName}_${col}_fkey`, { kind: "fk", cols: [col] });
}

function createTable(tables, stmt) {
  const m = stmt.match(new RegExp(`^create (?:unlogged )?table (?:if not exists )?(${NAME}) \\(`));
  if (!m) return;
  const t = newTable();
  tables.set(m[1], t);
  for (const item of splitTop(parenGroup(stmt).inner)) {
    if (/^(?:primary key|unique|foreign key)/.test(item.replace(/^constraint \w+ /, "")))
      constraintItem(t, m[1], item);
    else if (!/^(?:constraint|check|exclude|like)\b/.test(item)) addColumn(t, m[1], item);
  }
}

function dropColumn(t, col) {
  t.columns.delete(col);
  for (const map of [t.keys, t.indexes])
    for (const [n, k] of map) if (k.cols.includes(col)) map.delete(n);
}

function renameColumn(t, from, to) {
  if (t.columns.delete(from)) t.columns.add(to);
  for (const map of [t.keys, t.indexes])
    for (const k of map.values()) k.cols = k.cols.map((c) => (c === from ? to : c));
}

function alterAction(tables, name, action) {
  const t = tables.get(name);
  let m;
  if ((m = action.match(new RegExp(`^rename column (${NAME}) to (${NAME})$`))))
    renameColumn(t, m[1], m[2]);
  else if ((m = action.match(new RegExp(`^rename constraint (${NAME}) to (${NAME})$`)))) {
    if (t.keys.has(m[1])) {
      addKey(t, m[2], t.keys.get(m[1]));
      t.keys.delete(m[1]);
    }
  } else if ((m = action.match(new RegExp(`^rename to (${NAME})$`)))) {
    tables.set(m[1], t);
    tables.delete(name);
  } else if ((m = action.match(new RegExp(`^drop constraint (?:if exists )?(${NAME})`))))
    t.keys.delete(m[1]);
  else if ((m = action.match(new RegExp(`^drop column (?:if exists )?(${NAME})`))))
    dropColumn(t, m[1]);
  else if ((m = action.match(/^add column (.*)$/))) addColumn(t, name, m[1]);
  else if ((m = action.match(/^add (constraint .*|primary key.*|unique.*|foreign key.*)$/)))
    constraintItem(t, name, m[1]);
}

function alterTable(tables, stmt) {
  const m = stmt.match(new RegExp(`^alter table (?:if exists )?(?:only )?(${NAME}) (.*)$`));
  if (!m || !tables.has(m[1])) return;
  for (const action of splitTop(m[2])) alterAction(tables, m[1], action);
}

function createIndex(tables, stmt) {
  const m = stmt.match(
    new RegExp(
      `^create (?:unique )?index (?:concurrently )?(?:if not exists )?(${NAME}) on (?:only )?(${NAME})(?: using \\w+)? (.*)$`,
    ),
  );
  if (!m || !tables.has(m[2])) return;
  const { inner, rest } = parenGroup(m[3]);
  tables
    .get(m[2])
    .indexes.set(m[1], { cols: leadingColumns(inner), partial: /\bwhere\b/.test(rest) });
}

function dropOrRenameIndex(tables, stmt) {
  let m;
  if ((m = stmt.match(new RegExp(`^drop index (?:concurrently )?(?:if exists )?(${NAME})`))))
    for (const t of tables.values()) t.indexes.delete(m[1]);
  else if (
    (m = stmt.match(new RegExp(`^alter index (?:if exists )?(${NAME}) rename to (${NAME})$`)))
  )
    for (const t of tables.values())
      if (t.indexes.has(m[1])) {
        t.indexes.set(m[2], t.indexes.get(m[1]));
        t.indexes.delete(m[1]);
      }
}

/** Model of the schema after all migrations (Map table name -> { columns, keys, indexes }). */
export function replay(sqlTexts) {
  const tables = new Map();
  for (const text of sqlTexts)
    for (const stmt of statements(text)) {
      if (stmt.startsWith("create table") || stmt.startsWith("create unlogged table"))
        createTable(tables, stmt);
      else if (stmt.startsWith("alter table")) alterTable(tables, stmt);
      else if (stmt.startsWith("create")) createIndex(tables, stmt);
      else if (stmt.startsWith("drop table"))
        tables.delete(stmt.match(new RegExp(`^drop table (?:if exists )?(${NAME})`))?.[1]);
      else dropOrRenameIndex(tables, stmt);
    }
  return tables;
}

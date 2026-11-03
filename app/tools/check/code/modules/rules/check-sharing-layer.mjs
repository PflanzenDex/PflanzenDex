// AB-5 (FR-QG-05): social modules read foreign accounts only through the sharing layer. Called from check-layer-rules.mjs.
// A foreign account's rows are invisible to the row rule; the only doors are the `friend_*` database functions (audited
// in db/src/security-definer-inventory.test.ts). So:
//   - a `friend_*` function (found in the migrations, the module of the file's first line owns it) is called only from the
//     db adapters of its owner module; every other module reaches it through that module's public interface
//   - the code of the social modules (`social`, `swap`) contains no way around the row rule: no owner pool, no
//     `row_security`, no `bypassrls`, no `reset role` and no role other than the application role
import fs from "node:fs";
import path from "node:path";
import { LAYERS, locate, moduleOf } from "../check-modules.mjs";

const SOCIAL_MODULES = ["social", "swap"];
const DOOR = /\bfriend_[a-z_]+(?=\s*\()/g;
const AROUND_ROW_RULE =
  /\bopenOwnerPool\b|\brow_security\b|\bbypassrls\b|\breset role\b|\bset (?:local )?role (?!pflanzendex_app\b)\w+/gi;
const lineOf = (text, index) => text.slice(0, index).split("\n").length;
const isTest = (f) => /\.test\.[a-z]+$/.test(f) || /test-helpers\.[a-z]+$/.test(f);

/** Function name -> owner module, from `create [or replace] function friend_x` in migrations headed `-- module: m`. */
function doorOwners(appDir) {
  const dir = path.join(appDir, "packages", "db", "migrations");
  const owners = new Map();
  if (!fs.existsSync(dir)) return owners;
  for (const name of fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const text = fs.readFileSync(path.join(dir, name), "utf8");
    const mod = /^--\s*module:\s*(\w+)/.exec(text)?.[1];
    for (const m of text.matchAll(/create (?:or replace )?function (friend_[a-z_]+)/gi))
      if (mod && !owners.has(m[1])) owners.set(m[1], mod);
  }
  return owners;
}

export function checkSharingLayer({ appDir, add, cfg, h }) {
  const owners = doorOwners(appDir);
  for (const pkg of LAYERS)
    for (const file of h
      .walkCode(path.join(appDir, "packages", pkg, "src"))
      .filter((f) => !isTest(f))) {
      const loc = locate(appDir, file);
      const own = moduleOf(loc, cfg);
      const src = h.stripComments(fs.readFileSync(file, "utf8"));
      for (const m of src.matchAll(DOOR)) {
        const owner = owners.get(m[0]);
        if (owner && !(pkg === "db" && own === owner))
          add(
            "AB-5",
            file,
            lineOf(src, m.index),
            `${own ?? "root"} -> ${owner}: ${m[0]}() reads foreign accounts; only the db adapter of ${owner} may call it, use its public interface`,
          );
      }
      if (SOCIAL_MODULES.includes(own))
        for (const m of src.matchAll(AROUND_ROW_RULE))
          add(
            "AB-5",
            file,
            lineOf(src, m.index),
            `${own}: "${m[0]}" bypasses the row rule; foreign accounts are read only through the sharing layer`,
          );
    }
}

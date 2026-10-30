// Picks the values of the GitHub environment that go into the host's .env (TE-19, #1013, US-DEV-06).
// Usage in the deploy workflow:  node env-payload.mjs <env-example> <out-file>
//   env VARS_JSON = toJSON(vars), SECRETS_JSON = toJSON(secrets) of the environment (only in that step's env).
// The allowlist is every key of the deployed commit's .env.example (`KEY=` or `#KEY=` at the start of a line) minus
// the names on its `# host-only:` line; the host script deploy.apply-env.sh checks the same list again. Only
// non-empty values are taken; a secret wins over a variable of the same name; passwords, hashes and auth keys must be
// secrets. The KEY=VALUE lines go into <out-file>
// (mode 600), never to stdout. Stdout gets `::add-mask::` for every secret value taken and the key names only.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const KEY = /^[A-Z][A-Z0-9_]*$/;
// Passwords, hashes and auth keys are taken only from secrets (masked in logs); a variable of that name is an error.
export const SECRET_ONLY = /(PASSWORD|_HASH|AUTHKEY)$/;

/** Allowlist and host-only names from the text of a .env.example. */
export function allowedKeys(exampleText) {
  const keys = new Set();
  const hostOnly = new Set();
  for (const line of exampleText.split(/\r?\n/)) {
    const only = line.match(/^# host-only:(.*)$/);
    if (only) for (const name of only[1].trim().split(/\s+/).filter(Boolean)) hostOnly.add(name);
    const key = line.match(/^#?([A-Z][A-Z0-9_]*)=/);
    if (key) keys.add(key[1]);
  }
  for (const name of hostOnly) keys.delete(name);
  return { keys: [...keys].sort(), hostOnly: [...hostOnly].sort() };
}

/** Why a value cannot go into .env the same way for the shell and docker compose, or null. */
export function valueProblem(value) {
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value))
    return "contains a line break or another control character";
  if (/['\\]/.test(value)) return "contains a quote (') or a backslash";
  return null;
}

const text = (record, key) => (typeof record?.[key] === "string" ? record[key] : "");

/** One key: what to send, or why not. Values are never part of the returned texts. */
function pick(key, vars, secrets) {
  const secret = text(secrets, key);
  const variable = text(vars, key);
  const fromSecret = secret.length > 0;
  if (!fromSecret && variable.length > 0 && SECRET_ONLY.test(key))
    return {
      error: `${key} is set as a variable; set it as a secret (gh secret set ${key} --env <environment>)`,
    };
  const value = fromSecret ? secret : variable;
  if (value.length === 0) return null;
  const source = fromSecret ? "secret" : "variable";
  const mask = fromSecret ? secret : null;
  const problem = valueProblem(value);
  if (problem) return { mask, error: `${key} (${source}) ${problem}` };
  const both = fromSecret && variable.length > 0 ? " (also set as variable; the secret wins)" : "";
  return { mask, line: `${key}=${value}`, log: `${key} from ${source}${both}` };
}

/**
 * Lines to send, secret values to mask, a log without values, and errors (key names only).
 * @param {{ vars: Record<string, unknown>, secrets: Record<string, unknown>, allowed: string[] }} input
 */
export function buildPayload({ vars, secrets, allowed }) {
  const result = { lines: [], masks: [], log: [], errors: [] };
  for (const key of allowed.filter((k) => KEY.test(k))) {
    const p = pick(key, vars, secrets);
    if (!p) continue;
    if (p.mask) result.masks.push(p.mask);
    if (p.error) result.errors.push(p.error);
    else {
      result.lines.push(p.line);
      result.log.push(p.log);
    }
  }
  return result;
}

function parse(name) {
  const text = process.env[name];
  if (!text) return {};
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" ? value : {};
  } catch {
    throw new Error(`${name} is not valid JSON.`);
  }
}

export function main(argv = process.argv.slice(2), out = console.log) {
  const [examplePath, outFile] = argv;
  if (!examplePath || !outFile) throw new Error("usage: env-payload.mjs <env-example> <out-file>");
  const { keys, hostOnly } = allowedKeys(readFileSync(examplePath, "utf8"));
  const result = buildPayload({
    vars: parse("VARS_JSON"),
    secrets: parse("SECRETS_JSON"),
    allowed: keys,
  });
  // Mask first, before anything else is printed; a multi-line value is masked line by line (one command per line).
  for (const m of result.masks)
    for (const part of m.split(/[\r\n]+/)) if (part.trim()) out(`::add-mask::${part}`);
  out(
    `Allowlist: ${keys.length} keys from .env.example (host-only, never sent: ${hostOnly.join(" ") || "none"}).`,
  );
  for (const line of result.log) out(`  ${line}`);
  if (result.errors.length) {
    for (const e of result.errors) out(`::error::${e}; nothing is sent, nothing is deployed.`);
    return 1;
  }
  writeFileSync(outFile, result.lines.map((l) => `${l}\n`).join(""), { mode: 0o600 });
  out(`${result.lines.length} value(s) to apply on the host.`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    process.exitCode = main();
  } catch (e) {
    console.log(`::error::${e.message}`);
    process.exitCode = 1;
  }
}

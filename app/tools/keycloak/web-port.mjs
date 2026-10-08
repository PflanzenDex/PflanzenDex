// Allows the dev web port of a worktree as redirect origin of the Keycloak web client (#202, US-DEV-08).
// The realm export only knows 5173; worktrees get deterministic ports (54400-55899, worktree-env.mjs), and Keycloak
// accepts no wildcard in the host part, so the port is added through the admin API. Idempotent.
// Usage: node tools/keycloak/web-port.mjs [port ...]   (default: PFLANZENDEX_DEV_WEB_PORT from the environment or .env.worktree)
// Env:   KC_ADMIN_PASSWORD (default: app/config/dev/.env of this checkout or of the main checkout), E2E_KEYCLOAK_URL.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REALM = "pflanzendex";
const CLIENT_ID = "pflanzendex-web";
const LOGOUT_ATTRIBUTE = "post.logout.redirect.uris";

const origin = (port) => `http://localhost:${port}`;
const addTo = (list, value) => (list.includes(value) ? list : [...list, value]);

/** Pure: returns the client with the redirect URIs, web origins and logout redirects for `port` added. */
export function withWebPort(client, port) {
  const base = origin(port);
  const attributes = client.attributes ?? {};
  const logout = (attributes[LOGOUT_ATTRIBUTE] ?? "").split("##").filter(Boolean);
  return {
    ...client,
    redirectUris: addTo(client.redirectUris ?? [], `${base}/*`),
    webOrigins: addTo(client.webOrigins ?? [], base),
    attributes: { ...attributes, [LOGOUT_ATTRIBUTE]: addTo(logout, `${base}/*`).join("##") },
  };
}

export function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(`invalid port: ${value}`);
  return port;
}

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "..", "..");

function readEnvFile(file, key) {
  if (!existsSync(file)) return undefined;
  const line = readFileSync(file, "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${key}=`));
  return line?.slice(key.length + 1).trim();
}

function mainCheckout() {
  const common = execFileSync("git", ["rev-parse", "--git-common-dir"], {
    cwd: appDir,
    encoding: "utf8",
  }).trim();
  return dirname(join(appDir, common));
}

function adminPassword() {
  const fromEnv = process.env["KC_ADMIN_PASSWORD"];
  if (fromEnv) return fromEnv;
  const found =
    readEnvFile(join(appDir, "dev", ".env"), "KC_ADMIN_PASSWORD") ??
    readEnvFile(join(mainCheckout(), "app", "dev", ".env"), "KC_ADMIN_PASSWORD");
  if (!found) throw new Error("KC_ADMIN_PASSWORD missing: run `make auth-up` first");
  return found;
}

function defaultPorts() {
  const fromEnv = process.env["PFLANZENDEX_DEV_WEB_PORT"];
  const found =
    fromEnv ?? readEnvFile(join(appDir, "..", ".env.worktree"), "PFLANZENDEX_DEV_WEB_PORT");
  if (!found)
    throw new Error("no port given and PFLANZENDEX_DEV_WEB_PORT not found (.env.worktree)");
  return [found];
}

async function main(args) {
  const ports = (args.length ? args : defaultPorts()).map(parsePort);
  const keycloak = process.env["E2E_KEYCLOAK_URL"] ?? "http://localhost:18081";
  const login = await fetch(`${keycloak}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "password",
      client_id: "admin-cli",
      username: "admin",
      password: adminPassword(),
    }),
  });
  if (!login.ok)
    throw new Error(`Keycloak admin login failed: ${login.status} (is \`make auth-up\` running?)`);
  const headers = {
    Authorization: `Bearer ${(await login.json()).access_token}`,
    "Content-Type": "application/json",
  };
  const clients = `${keycloak}/admin/realms/${REALM}/clients`;
  const list = await (await fetch(`${clients}?clientId=${CLIENT_ID}`, { headers })).json();
  if (!list.length) throw new Error(`client ${CLIENT_ID} not found in realm ${REALM}`);
  const updated = ports.reduce(withWebPort, list[0]);
  const res = await fetch(`${clients}/${updated.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(updated),
  });
  if (!res.ok) throw new Error(`updating the client failed: ${res.status}`);
  console.log(`Allowed redirect origin(s): ${ports.map(origin).join(", ")}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`keycloak web-port: ${e.message}`);
    process.exit(1);
  });
}

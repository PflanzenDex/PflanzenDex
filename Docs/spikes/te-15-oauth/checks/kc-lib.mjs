// Helper functions for the Keycloak admin API (spike TE-15)
import fs from "node:fs";
const SEC = (() => {
  try {
    return JSON.parse(
      fs.readFileSync(new URL("./secrets/kc.json", import.meta.url)),
    );
  } catch {
    return {};
  }
})();
export const KC = process.env.KC_URL || "http://localhost:18080";
export const REALM = "pflanzendex";
let tok;
export async function admin(
  path,
  { method = "GET", body, realm = REALM, raw = false } = {},
) {
  if (!tok) {
    const r = await fetch(`${KC}/realms/master/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: "admin-cli",
        username: "admin",
        password: SEC.adminPassword || "admin",
      }),
    });
    tok = (await r.json()).access_token;
  }
  const base = realm ? `${KC}/admin/realms/${realm}` : `${KC}/admin/realms`;
  const r = await fetch(base + path, {
    method,
    headers: {
      authorization: `Bearer ${tok}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (raw) return { status: r.status, headers: r.headers, text };
  if (!r.ok && r.status !== 409)
    throw new Error(`${method} ${path} -> ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : { status: r.status };
}

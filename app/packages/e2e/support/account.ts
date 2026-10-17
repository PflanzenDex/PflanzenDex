import { randomUUID } from "node:crypto";
import fs from "node:fs";

// Test accounts are created through the Keycloak admin API (verified email, final password), so the flows
// under test start at the login page. Registration with mail confirmation is covered by docs/records/test-logs/acc-01.md.
const KEYCLOAK = process.env["E2E_KEYCLOAK_URL"] ?? "http://localhost:18081";
const REALM = "pflanzendex";

export interface TestAccount {
  email: string;
  password: string;
  displayName: string;
}

function adminPassword(): string {
  const fromEnv = process.env["KC_ADMIN_PASSWORD"];
  if (fromEnv) return fromEnv;
  const file = new URL("../../../config/dev/.env", import.meta.url);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed path next to this file
  const line = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .find((l) => l.startsWith("KC_ADMIN_PASSWORD="));
  if (!line) throw new Error("KC_ADMIN_PASSWORD missing: run `make auth-up` first");
  return line.slice("KC_ADMIN_PASSWORD=".length).trim();
}

async function adminToken(): Promise<string> {
  const res = await fetch(`${KEYCLOAK}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "password",
      client_id: "admin-cli",
      username: "admin",
      password: adminPassword(),
    }),
  });
  if (!res.ok) throw new Error(`Keycloak admin login failed: ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

export async function createTestAccount(): Promise<TestAccount> {
  const account: TestAccount = {
    email: `e2e-${randomUUID()}@example.test`,
    password: `Pw-${randomUUID()}`,
    displayName: "Erika Testfrau",
  };
  const res = await fetch(`${KEYCLOAK}/admin/realms/${REALM}/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await adminToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username: account.email,
      email: account.email,
      firstName: "Erika",
      lastName: "Testfrau",
      enabled: true,
      emailVerified: true,
      credentials: [{ type: "password", value: account.password, temporary: false }],
    }),
  });
  if (res.status !== 201)
    throw new Error(`Test account not created: ${res.status} ${await res.text()}`);
  return account;
}

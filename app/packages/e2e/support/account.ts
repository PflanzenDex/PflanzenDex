import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
  // Only the main checkout holds the `.env` of the shared Keycloak (`make auth-up`, issue 1187); a worktree reads it there.
  const here = fileURLToPath(new URL(".", import.meta.url));
  const common = execFileSync("git", ["rev-parse", "--git-common-dir"], {
    cwd: here,
    encoding: "utf8",
  }).trim();
  const file = join(dirname(resolve(here, common)), "app", "config", "dev", ".env");
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed path in the main checkout, no user input
  const line = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .find((l) => l.startsWith("KC_ADMIN_PASSWORD="));
  if (!line)
    throw new Error("KC_ADMIN_PASSWORD missing: run `make auth-up` in the main checkout first");
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

/** The audience of the client below: a real token of this realm, meant for another service (issue 204). */
export const FOREIGN_AUDIENCE = "e2e-foreign-service";
const FOREIGN_CLIENT = "e2e-foreign-audience";

/** A token the real Keycloak signs for this account, with the audience of another service. */
export async function foreignAudienceToken(account: TestAccount): Promise<string> {
  const created = await fetch(`${KEYCLOAK}/admin/realms/${REALM}/clients`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await adminToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      clientId: FOREIGN_CLIENT,
      publicClient: true,
      directAccessGrantsEnabled: true,
      standardFlowEnabled: false,
      protocolMappers: [
        {
          name: "foreign-audience",
          protocol: "openid-connect",
          protocolMapper: "oidc-audience-mapper",
          config: {
            "included.custom.audience": FOREIGN_AUDIENCE,
            "access.token.claim": "true",
          },
        },
      ],
    }),
  });
  // 409: an earlier test already created the client in this shared Keycloak.
  if (created.status !== 201 && created.status !== 409)
    throw new Error(`Client not created: ${created.status} ${await created.text()}`);
  const res = await fetch(`${KEYCLOAK}/realms/${REALM}/protocol/openid-connect/token`, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "password",
      client_id: FOREIGN_CLIENT,
      username: account.email,
      password: account.password,
    }),
  });
  if (!res.ok) throw new Error(`Token not issued: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

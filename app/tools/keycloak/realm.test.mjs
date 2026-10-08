// #203, #205: guards for the Keycloak realm export (development realm) and the PflanzenDex login theme
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dev = join(fileURLToPath(import.meta.url), "..", "..", "..", "config", "dev");
const realm = JSON.parse(readFileSync(join(dev, "keycloak", "pflanzendex-realm.json"), "utf8"));
const web = realm.clients.find((c) => c.clientId === "pflanzendex-web");

test("#203: access tokens live at most 5 minutes (the API verifies them locally, so this bounds the effect of sign-out on all devices)", () => {
  assert.ok(realm.accessTokenLifespan > 0 && realm.accessTokenLifespan <= 300);
  assert.equal(realm.revokeRefreshToken, true);
});

test("#205: the web client does not use the deprecated full scope", () => {
  assert.equal(web.fullScopeAllowed, false);
  assert.ok(
    web.protocolMappers.some((m) => m.name === "api-audience"),
    "the audience mapper keeps the API token valid",
  );
});

test("#205: the realm uses the PflanzenDex login theme and the theme ships a favicon", () => {
  assert.equal(realm.loginTheme, "pflanzendex");
  const theme = join(dev, "keycloak-theme", realm.loginTheme, "login");
  assert.ok(existsSync(join(theme, "theme.properties")));
  assert.ok(existsSync(join(theme, "resources", "img", "favicon.ico")));
  assert.match(
    readFileSync(join(theme, "resources", "img", "favicon.ico"))
      .subarray(0, 4)
      .toString("hex"),
    /^00000100$/,
    "valid ICO header",
  );
});

test("#202: the default dev port stays allowed (other ports are added by web-port.mjs)", () => {
  assert.ok(web.redirectUris.includes("http://localhost:5173/*"));
});

test("US-DEV-01: users sign in with a username; email stays an accepted login", () => {
  assert.equal(realm.registrationEmailAsUsername, false);
  assert.equal(realm.loginWithEmailAllowed, true);
});

test("US-DEV-01: the imported test users are dev-only (@example.test), enabled and verified", () => {
  const users = realm.users ?? [];
  assert.deepEqual(users.map((u) => u.username).sort(), ["test", "test2", "test3"]);
  for (const u of users) {
    assert.equal(u.email, `${u.username}@example.test`);
    assert.equal(u.enabled, true);
    assert.equal(u.emailVerified, true);
    assert.deepEqual(u.requiredActions ?? [], []);
    const [password] = u.credentials;
    assert.equal(password.type, "password");
    assert.equal(password.temporary, false);
    assert.ok(password.value.length >= 10, "meets the realm password policy length(10)");
  }
});

// #203, #205: guards for the Keycloak realm export (development realm) and the PflanzenDex login theme
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dev = join(fileURLToPath(import.meta.url), "..", "..", "..", "dev");
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

// The memory caps of the local dev containers stay local: production and CI never read them (US-DEV-08, #1084).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = new URL("../../../../", import.meta.url).pathname;
const devCompose = readFileSync(join(root, "app/config/dev/compose.yaml"), "utf8");
const makefile = readFileSync(join(root, "Makefile"), "utf8");
const devVariables = /\b(KC_MEMORY|KC_JAVA_HEAP|MAILPIT_MEMORY|DB_MEMORY)\b/;

function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

// Everything that deploys: the deploy config and the workflows that run it.
const deployFiles = [
  ...filesUnder(join(root, "app/config/deploy")),
  ...filesUnder(join(root, ".github/workflows")).filter((file) => /deploy/.test(file)),
].map((file) => ({ file: file.slice(root.length), text: readFileSync(file, "utf8") }));

// The block of one service in a compose file: from its key to the next service key at the same indent.
function service(compose, name) {
  const lines = compose.split("\n");
  const start = lines.indexOf(`  ${name}:`);
  assert.ok(start >= 0, `service ${name} missing`);
  const end = lines.findIndex((line, i) => i > start && /^ {0,2}\S/.test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
}

test("US-DEV-08 the dev Keycloak has a memory limit and a fixed JVM heap (#1084)", () => {
  const keycloak = service(devCompose, "keycloak");
  assert.match(keycloak, /memory: \$\{KC_MEMORY:-\d+m\}/);
  assert.match(keycloak, /JAVA_OPTS_KC_HEAP: \$\{KC_JAVA_HEAP:--Xms\d+m -Xmx\d+m\}/);
});

test("US-DEV-08 the dev mail catcher has a memory limit (#1084)", () => {
  assert.match(service(devCompose, "mailpit"), /memory: \$\{MAILPIT_MEMORY:-\d+m\}/);
});

test("US-DEV-08 make db-up starts the local test database with a memory limit (#1084)", () => {
  assert.match(makefile, /^DB_MEMORY \?= \d+[mg]$/m);
  assert.match(makefile, /docker run -d --name \$\(DB_CONTAINER\) --memory \$\(DB_MEMORY\)/);
});

test("US-DEV-08 no deploy file or deploy workflow loads a dev compose file (#1084)", () => {
  assert.ok(deployFiles.length > 0, "no deploy files found");
  for (const { file, text } of deployFiles) {
    assert.doesNotMatch(text, /dev\/(storage\.)?compose\.ya?ml/, file);
  }
});

test("US-DEV-08 the dev cap variables never reach a deploy file, production keeps its own limits (#1084)", () => {
  for (const { file, text } of deployFiles) {
    assert.doesNotMatch(text, devVariables, file);
  }
  const production = readFileSync(join(root, "app/config/deploy/docker-compose.yml"), "utf8");
  const keycloak = service(production, "keycloak");
  assert.match(keycloak, /JAVA_OPTS_KC_HEAP: \$\{KEYCLOAK_JAVA_HEAP:-/);
  assert.match(keycloak, /limits:\n\s+memory: \d+m/);
});

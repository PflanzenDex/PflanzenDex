import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Static checks of the deploy files (TE-03). The running stack is checked by hand (docs/guides/operations/staging-deploy-and-backup.md).
const read = (path: string) =>
  readFileSync(new URL(`../../../../../config/${path}`, import.meta.url), "utf8");
const proxy = read("deploy/proxy.Caddyfile");
const compose = read("deploy/docker-compose.yml");
const testOverlay = read("deploy/docker-compose.test.yml");
const mailRoute = read("deploy/proxy.mail.caddy");
const funnel = read("deploy/docker-compose.funnel.yml");
const serveConfig = JSON.parse(read("deploy/docker/tailscale/serve.json")) as {
  TCP: Record<string, { HTTPS: boolean }>;
  Web: Record<string, { Handlers: Record<string, { Proxy: string }> }>;
  AllowFunnel: Record<string, boolean>;
};
const initDb = read("deploy/keycloak/init-db.sh");
const envExample = read("deploy/.env.example");
const realmFile = read("deploy/keycloak/pflanzendex-realm.json");
const realm = JSON.parse(realmFile) as Record<string, unknown>;
const devRealm = JSON.parse(read("dev/keycloak/pflanzendex-realm.json")) as Record<string, unknown>;

type Client = { clientId: string } & Record<string, unknown>;
const clientOf = (r: Record<string, unknown>, id: string) =>
  (r["clients"] as Client[]).find((c) => c.clientId === id);

/** The block of one service in the compose file (up to the next service). */
function service(text: string, name: string): string {
  const start = text.indexOf(`\n  ${name}:\n`);
  expect(start, `service "${name}" exists`).toBeGreaterThan(-1);
  const next = text.slice(start + 1).search(/\n {2}[a-z-]+:\n|\nvolumes:/);
  return text.slice(start, next < 0 ? undefined : start + 1 + next);
}

describe("TE-03 · reverse proxy in front of the host", () => {
  it("TE-03 serves both hostnames and picks plain HTTP or HTTPS by one variable", () => {
    expect(proxy).toContain("{$CADDY_SCHEME}{$APP_HOST} {");
    expect(proxy).toContain("{$CADDY_SCHEME}{$AUTH_HOST} {");
  });

  it("TE-03 believes forwarded headers only from the configured proxy addresses", () => {
    expect(proxy).toMatch(/trusted_proxies static \{\$TRUSTED_PROXIES\}/);
    expect(proxy).not.toMatch(/private_ranges/);
  });

  it("TE-03 routes /health and /api to the API (prefix removed) and the rest to web", () => {
    expect(proxy).toMatch(/handle \/health \{\s*reverse_proxy api:3000/);
    expect(proxy).toMatch(/handle_path \/api\/\* \{[\s\S]*?handle \{\s*reverse_proxy api:3000/);
    expect(proxy).toMatch(/handle \{\s*reverse_proxy web:8080/);
  });

  it("TE-03 routes the sign-in hostname to Keycloak and compresses both hosts (NFR-12)", () => {
    expect(proxy).toMatch(/handle \{\s*reverse_proxy keycloak:8080/);
    expect(proxy.match(/import compress/g)).toHaveLength(2);
  });

  it("TE-03 the mail catcher route exists only in the test overlay", () => {
    expect(proxy).toContain("import /etc/caddy/conf.d/*");
    expect(proxy).not.toContain("mailpit");
    expect(compose).not.toContain("mailpit");
    expect(mailRoute).toMatch(/handle \/mail\/\* \{[\s\S]*reverse_proxy mailpit:8025/);
    expect(testOverlay).toContain("./proxy.mail.caddy:/etc/caddy/conf.d/mail.caddy:ro");
    expect(testOverlay).toContain("MP_WEBROOT: /mail");
  });
});

describe("TE-03 · public test environment through Tailscale Funnel", () => {
  it("TE-03 the funnel overlay publishes no host port except the proxy's port 80 on loopback", () => {
    const mappings = [...funnel.matchAll(/^\s+- "([^"]*:\d+)"$/gm)].map((m) => m[1]);
    expect(mappings).toEqual(["127.0.0.1:${HTTP_PORT:-80}:80"]);
    expect(service(funnel, "proxy")).toContain("ports: !override");
    expect(funnel).not.toContain("443:");
  });

  it("TE-03 two Tailscale nodes in userspace mode, pinned image, state volumes and memory limits", () => {
    expect(funnel).toMatch(/image: tailscale\/tailscale:v\d+\.\d+\.\d+\n/);
    expect(funnel).toContain('TS_USERSPACE: "true"');
    expect(funnel).not.toMatch(/\/dev\/net\/tun|cap_add|privileged/);
    // Optional: after the first registration the state volume is enough and the key leaves .env.
    expect(funnel).toContain("TS_AUTHKEY: ${TS_AUTHKEY:-}");
    for (const [name, env] of [
      ["ts-app", "TS_APP_NAME"],
      ["ts-auth", "TS_AUTH_NAME"],
    ] as const) {
      const block = service(funnel, name);
      expect(block, name).toContain(`TS_HOSTNAME: \${${env}}`);
      expect(block, name).toContain(`tsstate-${name.slice(3)}:/var/lib/tailscale`);
    }
    expect(funnel).toMatch(/limits:\s+memory: \d+m/);
  });

  it("TE-03 the serve config allows Funnel on 443 only and proxies to the proxy service", () => {
    const host = "${TS_CERT_DOMAIN}:443";
    expect(Object.keys(serveConfig.TCP)).toEqual(["443"]);
    expect(serveConfig.TCP["443"]?.HTTPS).toBe(true);
    expect(serveConfig.AllowFunnel).toEqual({ [host]: true });
    expect(Object.keys(serveConfig.Web)).toEqual([host]);
    expect(serveConfig.Web[host]?.Handlers["/"]?.Proxy).toBe("http://proxy:80");
    expect(funnel).toContain("TS_SERVE_CONFIG: /config/serve.json");
  });

  it("TE-03 only the two Tailscale nodes are trusted proxies: fixed subnet and addresses", () => {
    expect(funnel).toContain("subnet: 172.29.40.0/24");
    // Dynamic addresses stay outside the fixed ones, otherwise an earlier container takes .2 or .3.
    expect(funnel).toContain("ip_range: 172.29.40.128/25");
    expect(service(funnel, "ts-app")).toContain("ipv4_address: 172.29.40.2");
    expect(service(funnel, "ts-auth")).toContain("ipv4_address: 172.29.40.3");
    expect(envExample).toContain("TRUSTED_PROXIES=172.29.40.2/32 172.29.40.3/32");
  });

  it("TE-03 the app host serves only the status of /health; the details stay inside the stack (#759)", () => {
    const app = proxy.slice(
      proxy.indexOf("{$CADDY_SCHEME}{$APP_HOST} {"),
      proxy.indexOf("{$CADDY_SCHEME}{$AUTH_HOST} {"),
    );
    expect(app).toContain("handle /health/* {\n\t\trespond 404\n\t}");
    expect(app).toMatch(/handle_path \/api\/\* \{\s*handle \/health\/\* \{\s*respond 404/);
    expect(read("deploy/scripts/deploy.sh")).toContain(
      "exec -T api wget -qO- http://127.0.0.1:3000/health/details",
    );
  });

  it("TE-03 the sign-in host denies Keycloak's admin, master realm and management paths", () => {
    const auth = proxy.slice(proxy.indexOf("{$CADDY_SCHEME}{$AUTH_HOST} {"));
    for (const path of ["/admin*", "/realms/master*", "/metrics*", "/health*"])
      expect(auth, path).toContain(`handle ${path} {\n\t\trespond 404\n\t}`);
    expect(auth.indexOf("respond 404")).toBeLessThan(auth.indexOf("import /etc/caddy/conf.d/*"));
    expect(auth).not.toMatch(/handle \/(realms\/pflanzendex|resources|js)/);
  });

  it("TE-03 the mail catcher UI requires basic auth with a hash from the environment", () => {
    expect(mailRoute).toMatch(/basic_auth \{\s+\{\$MAIL_UI_USER\} \{\$MAIL_UI_HASH\}/);
    expect(mailRoute.indexOf("basic_auth")).toBeLessThan(mailRoute.indexOf("reverse_proxy"));
    expect(service(testOverlay, "proxy")).toContain("MAIL_UI_HASH: ${MAIL_UI_HASH:?");
    expect(envExample).toMatch(/^MAIL_UI_HASH='[^']*'$/m);
  });

  it("TE-03 .env.example names every funnel variable and holds no real key", () => {
    const names = [...funnel.matchAll(/\$\{(TS_[A-Z_]+)[:}]/g)]
      .map((m) => m[1])
      .filter((n) => n !== "TS_CERT_DOMAIN");
    expect(names.length).toBeGreaterThan(2);
    const assigned = envExample.split("\n").map((line) => line.replace(/^#/, "").split("=")[0]);
    for (const name of new Set(names)) expect(assigned, name).toContain(name);
    expect(envExample).toMatch(/^TS_AUTHKEY=PUT_A_TAILSCALE_AUTH_KEY_HERE$/m);
  });
});

describe("TE-03 · log size limits (#762)", () => {
  const services = (text: string) =>
    [...text.slice(text.indexOf("\nservices:\n")).matchAll(/^ {2}([a-z][a-z-]*):$/gm)]
      .map((m) => m[1] as string)
      .filter((name) => !["dbdata", "caddydata", "default"].includes(name));
  const limit = /logging:\s+driver: json-file\s+options:\s+max-size: 10m\s+max-file: "3"/;

  it("TE-03 every service of the base stack keeps at most 3 log files of 10 MB", () => {
    expect(compose).toMatch(
      /x-logging: &logging\s+driver: json-file\s+options:\s+max-size: 10m\s+max-file: "3"/,
    );
    const names = services(compose.slice(0, compose.indexOf("\nvolumes:")));
    expect(names).toEqual([
      "db",
      "keycloak-db",
      "db-roles",
      "migrate",
      "keycloak",
      "api",
      "web",
      "proxy",
    ]);
    for (const name of names) expect(service(compose, name), name).toContain("logging: *logging");
  });

  it("TE-03 the services of the test and funnel overlays have the same limit", () => {
    expect(service(testOverlay, "mailpit")).toMatch(limit);
    const anchor = funnel.slice(funnel.indexOf("x-tailscale:"), funnel.indexOf("\nservices:"));
    expect(anchor).toMatch(limit);
    for (const name of ["ts-app", "ts-auth"])
      expect(service(funnel, name)).toContain("<<: *tailscale");
  });
});

describe("TE-03 · sign-in service in the stack", () => {
  const keycloak = service(compose, "keycloak");
  const api = service(compose, "api");

  it("TE-03 runs Keycloak in production mode with its own database and forwarded headers", () => {
    expect(keycloak).toContain("quay.io/keycloak/keycloak:26.8.0");
    expect(keycloak).toContain('command: ["start", "--import-realm"]');
    expect(keycloak).not.toContain("start-dev");
    expect(keycloak).toContain("KC_DB: postgres");
    expect(keycloak).toContain("KC_PROXY_HEADERS: xforwarded");
    expect(keycloak).toContain("KC_HOSTNAME: ${AUTH_URL");
    expect(keycloak).toContain("KC_HEALTH_ENABLED");
    expect(keycloak).toMatch(/KC_BOOTSTRAP_ADMIN_PASSWORD: \$\{KEYCLOAK_ADMIN_PASSWORD:\?/);
  });

  it("TE-03 the deploy turns on brute-force protection in the master realm after Keycloak is healthy (#758)", () => {
    const deploy = read("deploy/scripts/deploy.sh");
    const healthy = deploy.indexOf("wait_healthy keycloak");
    expect(healthy).toBeGreaterThan(-1);
    expect(deploy.indexOf("./keycloak/master-realm.sh || return 1")).toBeGreaterThan(healthy);
    expect(keycloak).toContain("KC_BOOTSTRAP_ADMIN_USERNAME: ${KEYCLOAK_ADMIN_USER");
  });

  it("TE-03 the same Keycloak version as the development stack", () => {
    const dev = read("dev/compose.yaml");
    const image = /image: (quay\.io\/keycloak\/keycloak:\S+)/;
    expect(image.exec(compose)?.[1]).toBe(image.exec(dev)?.[1]);
  });

  it("TE-03 the API verifies the public issuer and fetches keys inside the network", () => {
    expect(api).toContain("OIDC_ISSUER: ${AUTH_URL:?AUTH_URL is missing}/realms/pflanzendex");
    expect(api).toContain("OIDC_JWKS_URL: http://keycloak:8080/");
    expect(api).toContain("OIDC_AUDIENCE: pflanzendex-api");
    expect(api).toContain("WEB_ORIGIN: ${APP_URL");
  });

  it("TE-03 the web build gets the sign-in and API addresses", () => {
    const web = service(compose, "web");
    for (const arg of ["VITE_OIDC_AUTHORITY", "VITE_OIDC_CLIENT_ID", "VITE_API_URL"])
      expect(web).toContain(`${arg}:`);
    expect(read("deploy/docker/web.Dockerfile")).toContain("ARG VITE_API_URL");
  });

  it("TE-03 the sign-in role cannot reach the app database and only the proxy is published", () => {
    expect(initDb).toContain("revoke connect on database %I from public', :'appdb'");
    expect(initDb).not.toMatch(/grant [^\n]*:'appdb'[^\n]*:'kcuser'/);
    expect(compose.match(/^\s+ports:/gm)).toHaveLength(2);
    expect(service(compose, "proxy")).toContain("ports:");
  });

  it("TE-03 the sign-in host's root redirects to the app, not to the admin console", () => {
    expect(proxy).toMatch(/handle \/ \{\s+redir \{\$APP_URL\} 302\s+\}/);
    expect(service(compose, "proxy")).toContain("APP_URL: ${APP_URL:?");
  });

  it("TE-03 the app host sends security headers and allows only itself and the sign-in host", () => {
    const app = proxy.slice(proxy.indexOf("{$APP_HOST} {"), proxy.indexOf("{$AUTH_HOST} {"));
    for (const h of [
      "Strict-Transport-Security",
      'X-Content-Type-Options "nosniff"',
      "Referrer-Policy",
      'X-Frame-Options "DENY"',
      "-Server",
      "-Via",
    ])
      expect(app, h).toContain(h);
    const csp = /Content-Security-Policy "([^"]+)"/.exec(app)?.[1] ?? "";
    expect(csp).toContain("script-src 'self';");
    expect(csp).not.toMatch(/script-src[^;]*unsafe/);
    expect(csp).toContain("connect-src 'self' {$AUTH_URL}");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(service(compose, "proxy")).toContain("AUTH_URL: ${AUTH_URL:?");
  });

  it("TE-03 the admin console has its own address on the host's loopback only", () => {
    expect(keycloak).toContain("KC_HOSTNAME_ADMIN: http://localhost:${KEYCLOAK_ADMIN_PORT:-8180}");
    expect(keycloak).toContain('- "127.0.0.1:${KEYCLOAK_ADMIN_PORT:-8180}:8080"');
    const published = [...compose.matchAll(/^\s+- "([^"]+:\d+)"$/gm)].map((m) => m[1] ?? "");
    const keycloakPorts = published.filter((p) => p.endsWith(":8080"));
    expect(keycloakPorts).toHaveLength(1);
    for (const port of keycloakPorts) expect(port, port).toMatch(/^127\.0\.0\.1:/);
  });

  it("TE-03 every service has a memory limit", () => {
    for (const name of ["db", "keycloak-db", "migrate", "keycloak", "api", "web", "proxy"])
      expect(service(compose, name), name).toMatch(/limits:\s+memory: \d+m/);
    expect(service(testOverlay, "mailpit")).toMatch(/limits:\s+memory: \d+m/);
  });

  it("TE-03 .env.example names every variable the compose file requires and holds no secret", () => {
    const required = [...compose.matchAll(/\$\{([A-Z_]+):\?/g)].map((m) => m[1]);
    expect(required.length).toBeGreaterThan(5);
    const assigned = envExample.split("\n").map((line) => line.split("=")[0]);
    for (const name of required) expect(assigned, name).toContain(name);
    for (const line of envExample.split("\n").filter((l) => /PASSWORD=/.test(l)))
      expect(line, line).toMatch(/=(PUT_A_LONG_RANDOM_PASSWORD_HERE)?$/);
  });
});

describe("TE-03 · realm for deployments", () => {
  const web = clientOf(realm, "pflanzendex-web") as Client;
  const devWeb = clientOf(devRealm, "pflanzendex-web") as Client;

  it("TE-03 takes redirect addresses and origins from the environment, never from localhost", () => {
    expect(realmFile).not.toMatch(/localhost|127\.0\.0\.1/);
    expect(web["redirectUris"]).toEqual(["${WEB_BASE_URL}/*"]);
    expect(web["webOrigins"]).toEqual(["${WEB_BASE_URL}"]);
  });

  it("TE-03 keeps clients, audience mapper, token lifetimes and theme of the development realm", () => {
    const skip = ["rootUrl", "redirectUris", "webOrigins", "attributes"];
    const strip = (c: Client) =>
      Object.fromEntries(Object.entries(c).filter(([k]) => !skip.includes(k)));
    expect(strip(web)).toEqual(strip(devWeb));
    expect(clientOf(realm, "pflanzendex-api")).toEqual(clientOf(devRealm, "pflanzendex-api"));
    expect((web["attributes"] as Record<string, string>)["pkce.code.challenge.method"]).toBe(
      "S256",
    );
    for (const key of [
      "loginTheme",
      "accessTokenLifespan",
      "verifyEmail",
      "registrationAllowed",
      "bruteForceProtected",
      "sslRequired",
    ])
      expect(realm[key], key).toEqual(devRealm[key]);
  });

  // Deliberately stricter than the development realm, whose test users and their passwords stay as they are (#757).
  it("TE-03 deployments get a stronger password policy, shorter sessions and login events (#757)", () => {
    expect(realm["passwordPolicy"]).toBe(
      "length(12) and maxLength(128) and notUsername and notEmail",
    );
    expect(devRealm["passwordPolicy"]).toBe("length(10)");
    const day = 86400;
    expect(realm).toMatchObject({
      ssoSessionIdleTimeout: day,
      ssoSessionMaxLifespan: 7 * day,
      ssoSessionIdleTimeoutRememberMe: 7 * day,
      ssoSessionMaxLifespanRememberMe: 30 * day,
      eventsEnabled: true,
      eventsExpiration: 30 * day,
      adminEventsEnabled: true,
      adminEventsDetailsEnabled: false,
    });
  });

  it("TE-03 the runbook applies the same realm defaults to an existing realm with kcadm.sh (#757)", () => {
    const runbook = readFileSync(
      new URL(
        "../../../../../../docs/guides/operations/staging-deploy-and-backup.md",
        import.meta.url,
      ),
      "utf8",
    );
    expect(runbook).toContain(`-s 'passwordPolicy=${String(realm["passwordPolicy"])}'`);
    for (const key of [
      "ssoSessionIdleTimeout",
      "ssoSessionMaxLifespan",
      "ssoSessionIdleTimeoutRememberMe",
      "ssoSessionMaxLifespanRememberMe",
      "eventsEnabled",
      "eventsExpiration",
      "adminEventsEnabled",
      "adminEventsDetailsEnabled",
    ])
      expect(runbook, key).toContain(`-s ${key}=${String(realm[key])}`);
  });

  it("TE-03 ships no users and sends mail through a configurable server", () => {
    expect(realm["users"]).toBeUndefined();
    const smtp = realm["smtpServer"] as Record<string, string>;
    expect(smtp["host"]).toBe("${KC_SMTP_HOST}");
    expect(smtp["password"]).toBe("${KC_SMTP_PASSWORD}");
  });
});

describe("US-DEV-07 · PostgreSQL 18 in the stack", () => {
  const db = service(compose, "db");
  const deployScript = read("deploy/scripts/deploy.sh");
  const readRoot = (path: string) =>
    readFileSync(new URL(`../../../../../../${path}`, import.meta.url), "utf8");

  it("US-DEV-07 every PostgreSQL image in the repository is the same major, 18", () => {
    const texts = [
      compose,
      read("deploy/scripts/restore-test.sh"),
      readRoot(".github/workflows/ci.yml"),
      readRoot(".github/workflows/nightly.yml"),
      readRoot("Makefile"),
    ];
    const majors = texts.flatMap((text) =>
      [...text.matchAll(/postgres:(\d+)-alpine/g)].map((m) => m[1]),
    );
    expect(majors).toHaveLength(9);
    expect(new Set(majors)).toEqual(new Set(["18"]));
  });

  it("US-DEV-07 the data volume is mounted one level up, where PostgreSQL 18 keeps its data", () => {
    expect(db).toContain("- dbdata:/var/lib/postgresql\n");
    expect(db).not.toContain("/var/lib/postgresql/data");
  });

  it("US-DEV-07 deploy.sh checks the data volume before the stack starts (P-10)", () => {
    const check = deployScript.indexOf("check_db_volume || return 1");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(deployScript.indexOf('"${compose[@]}" up -d --build'));
  });
});

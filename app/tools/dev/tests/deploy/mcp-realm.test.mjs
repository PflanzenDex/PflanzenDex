// Tests for deploy/keycloak/mcp/ (setup.mjs, steps.mjs, target-state.mjs) against an in-memory admin API (no Keycloak, no network; US-KI-07, TE-16).
import assert from "node:assert/strict";
import { test } from "node:test";

import { adminClient, checkDiscovery } from "../../../../config/deploy/keycloak/mcp/setup.mjs";
import { setupMcpRealm } from "../../../../config/deploy/keycloak/mcp/steps.mjs";
import { covers } from "../../../../config/deploy/keycloak/mcp/target-state.mjs";

const URL_MCP = "https://app.example.test/api/mcp";
const DCR = "org.keycloak.services.clientregistration.policy.ClientRegistrationPolicy";

// A fresh realm as Keycloak creates it: default scopes, the default anonymous registration policies, no client policy.
function fakeRealm() {
  let next = 1;
  const id = () => `id-${next++}`;
  const state = {
    scopes: [{ id: id(), name: "offline_access", protocol: "openid-connect", attributes: {} }],
    optional: [],
    mappers: {},
    clients: [{ id: id(), clientId: "pflanzendex-web", attributes: {} }],
    components: [
      {
        id: id(),
        name: "Trusted Hosts",
        subType: "anonymous",
        providerId: "trusted-hosts",
        config: {
          "trusted-hosts": [],
          "host-sending-registration-request-must-match": ["true"],
          "client-uris-must-match": ["true"],
        },
      },
      {
        id: id(),
        name: "Allowed Client Scopes",
        subType: "anonymous",
        providerId: "allowed-client-templates",
        config: { "allow-default-scopes": ["true"] },
      },
      {
        id: id(),
        name: "Max Clients Limit",
        subType: "anonymous",
        providerId: "max-clients",
        config: { "max-clients": ["200"] },
      },
    ],
    profiles: [{ name: "other-profile", executors: [] }],
    policies: [],
  };
  const writes = [];
  const clone = (x) => structuredClone(x);
  const kc = {
    async get(path) {
      if (path === "") return { id: "realm-id", realm: "pflanzendex" };
      if (path === "/client-scopes") return clone(state.scopes);
      if (path === "/default-optional-client-scopes") return clone(state.optional);
      let m = path.match(/^\/client-scopes\/(.+)\/protocol-mappers\/models$/);
      if (m) return clone(state.mappers[m[1]] ?? []);
      m = path.match(/^\/clients\?clientId=(.+)$/);
      if (m) return clone(state.clients.filter((c) => c.clientId === decodeURIComponent(m[1])));
      if (path === `/components?type=${encodeURIComponent(DCR)}`) return clone(state.components);
      if (path === "/client-policies/profiles") return { profiles: clone(state.profiles) };
      if (path === "/client-policies/policies") return { policies: clone(state.policies) };
      throw new Error(`unexpected GET ${path}`);
    },
    async post(path, body) {
      writes.push(`POST ${path}`);
      if (path === "/client-scopes") return void state.scopes.push({ ...clone(body), id: id() });
      if (path === "/clients") return void state.clients.push({ ...clone(body), id: id() });
      if (path === "/components") return void state.components.push({ ...clone(body), id: id() });
      const m = path.match(/^\/client-scopes\/(.+)\/protocol-mappers\/models$/);
      if (m) return void (state.mappers[m[1]] ??= []).push({ ...clone(body), id: id() });
      throw new Error(`unexpected POST ${path}`);
    },
    async put(path, body) {
      writes.push(`PUT ${path}`);
      let m = path.match(/^\/default-optional-client-scopes\/(.+)$/);
      if (m)
        return void state.optional.push({
          id: m[1],
          name: state.scopes.find((s) => s.id === m[1]).name,
        });
      if (path === "/client-policies/profiles") return void (state.profiles = clone(body.profiles));
      if (path === "/client-policies/policies") return void (state.policies = clone(body.policies));
      const replace = (list) => {
        const i = list.findIndex((x) => x.id === body.id);
        assert.ok(i >= 0, `PUT ${path} names an unknown id`);
        list[i] = clone(body);
      };
      if ((m = path.match(/^\/client-scopes\/([^/]+)$/))) return replace(state.scopes);
      if ((m = path.match(/^\/clients\/(.+)$/))) return replace(state.clients);
      if ((m = path.match(/^\/components\/(.+)$/))) return replace(state.components);
      if ((m = path.match(/^\/client-scopes\/(.+)\/protocol-mappers\/models\/(.+)$/)))
        return replace(state.mappers[m[1]]);
      throw new Error(`unexpected PUT ${path}`);
    },
  };
  return { kc, state, writes };
}

test("US-KI-07: a fresh realm gets scopes, audience mapper, resource client, registration policies and PKCE S256", async () => {
  const { kc, state } = fakeRealm();
  const changes = await setupMcpRealm(kc, { resourceUrl: URL_MCP });
  assert.equal(changes.length, 14, changes.join("\n"));

  const names = ["pflanzen:read", "pflanzen:draft", "pflanzen:write"];
  for (const name of names) {
    const scope = state.scopes.find((s) => s.name === name);
    assert.ok(scope, name);
    assert.equal(scope.attributes["include.in.token.scope"], "true");
    assert.ok(
      state.optional.some((s) => s.id === scope.id),
      `${name} is optional`,
    );
    const [mapper] = state.mappers[scope.id];
    assert.equal(mapper.protocolMapper, "oidc-audience-mapper");
    assert.equal(mapper.config["included.custom.audience"], URL_MCP, "aud is the resource URL");
    assert.equal(mapper.config["included.client.audience"], undefined);
  }
  const resource = state.clients.find((c) => c.clientId === "pflanzendex-mcp");
  assert.equal(resource.attributes.resource_url, URL_MCP);
  assert.equal(resource.standardFlowEnabled, false);

  const acs = state.components.find((c) => c.name === "Allowed Client Scopes");
  assert.deepEqual(acs.config["allowed-client-scopes"], [...names, "offline_access"]);
  assert.deepEqual(acs.config["allow-default-scopes"], ["true"]);
  const th = state.components.find((c) => c.name === "Trusted Hosts");
  assert.deepEqual(th.config["trusted-hosts"], [
    "claude.ai",
    "chatgpt.com",
    "localhost",
    "127.0.0.1",
  ]);
  assert.deepEqual(th.config["host-sending-registration-request-must-match"], ["false"]);
  assert.deepEqual(state.components.find((c) => c.name === "Max Clients Limit").config, {
    "max-clients": ["200"],
  });

  assert.deepEqual(
    state.profiles.map((p) => p.name),
    ["other-profile", "pkce-s256"],
    "other profiles are kept",
  );
  assert.equal(state.profiles[1].executors[0].executor, "pkce-enforcer");
  assert.deepEqual(state.policies[0].profiles, ["pkce-s256"]);
  assert.equal(state.policies[0].conditions[0].condition, "any-client");
});

test("US-KI-07: a second run changes nothing (idempotent)", async () => {
  const { kc, writes } = fakeRealm();
  await setupMcpRealm(kc, { resourceUrl: URL_MCP });
  writes.length = 0;
  assert.deepEqual(await setupMcpRealm(kc, { resourceUrl: URL_MCP }), []);
  assert.deepEqual(writes, []);
});

test("US-KI-07: a changed APP_URL updates the resource client and the three audience mappers", async () => {
  const { kc, state, writes } = fakeRealm();
  await setupMcpRealm(kc, { resourceUrl: URL_MCP });
  writes.length = 0;
  const next = "https://new.example.test/api/mcp";
  const changes = await setupMcpRealm(kc, { resourceUrl: next });
  assert.equal(changes.length, 4, changes.join("\n"));
  assert.equal(writes.length, 4);
  const resource = state.clients.find((c) => c.clientId === "pflanzendex-mcp");
  assert.equal(resource.attributes.resource_url, next);
  for (const list of Object.values(state.mappers))
    assert.equal(list[0].config["included.custom.audience"], next);
});

test("US-KI-07: the old client-audience mapper is replaced by the resource URL, then left alone", async () => {
  const { kc, state, writes } = fakeRealm();
  await setupMcpRealm(kc, { resourceUrl: URL_MCP });
  // The state the first job left on the test realm: aud = the client id `pflanzendex-mcp` (TE-16).
  for (const list of Object.values(state.mappers))
    list[0].config = {
      "included.client.audience": "pflanzendex-mcp",
      "id.token.claim": "false",
      "access.token.claim": "true",
      "introspection.token.claim": "true",
    };
  writes.length = 0;
  const changes = await setupMcpRealm(kc, { resourceUrl: URL_MCP });
  assert.deepEqual(changes, [
    "updated audience mapper on pflanzen:read",
    "updated audience mapper on pflanzen:draft",
    "updated audience mapper on pflanzen:write",
  ]);
  for (const list of Object.values(state.mappers)) {
    assert.equal(list.length, 1, "updated in place, no second mapper");
    assert.equal(list[0].config["included.custom.audience"], URL_MCP);
    assert.equal(list[0].config["included.client.audience"], undefined);
  }
  writes.length = 0;
  assert.deepEqual(await setupMcpRealm(kc, { resourceUrl: URL_MCP }), []);
  assert.deepEqual(writes, []);
});

test("US-KI-07: a mapper that has the URL but also a client audience is cleaned", async () => {
  const { kc, state } = fakeRealm();
  await setupMcpRealm(kc, { resourceUrl: URL_MCP });
  const [first] = Object.values(state.mappers);
  first[0].config["included.client.audience"] = "pflanzendex-mcp";
  assert.equal((await setupMcpRealm(kc, { resourceUrl: URL_MCP })).length, 1);
  assert.equal(first[0].config["included.client.audience"], undefined);
});

test("US-KI-07: a scope that drifted (token scope off) is put back", async () => {
  const { kc, state } = fakeRealm();
  await setupMcpRealm(kc, { resourceUrl: URL_MCP });
  state.scopes.find((s) => s.name === "pflanzen:write").attributes["include.in.token.scope"] =
    "false";
  assert.deepEqual(await setupMcpRealm(kc, { resourceUrl: URL_MCP }), [
    "updated client scope pflanzen:write",
  ]);
  assert.equal(
    state.scopes.find((s) => s.name === "pflanzen:write").attributes["include.in.token.scope"],
    "true",
  );
});

test("US-KI-07: missing registration policies are created under the realm", async () => {
  const { kc, state } = fakeRealm();
  state.components = [];
  await setupMcpRealm(kc, { resourceUrl: URL_MCP });
  assert.deepEqual(
    state.components.map((c) => [c.name, c.parentId, c.providerType]),
    [
      ["Trusted Hosts", "realm-id", DCR],
      ["Allowed Client Scopes", "realm-id", DCR],
    ],
  );
});

test("US-KI-07: refuses a missing or relative resource URL before writing anything", async () => {
  const { kc, writes } = fakeRealm();
  await assert.rejects(setupMcpRealm(kc, { resourceUrl: undefined }), /AI_RESOURCE_URL/);
  await assert.rejects(setupMcpRealm(kc, { resourceUrl: "/api/mcp" }), /AI_RESOURCE_URL/);
  assert.deepEqual(writes, []);
});

test("US-KI-07: discovery check refuses CIMD and names a missing scope", () => {
  const ok = {
    client_id_metadata_document_supported: false,
    scopes_supported: ["openid", "pflanzen:read", "pflanzen:draft", "pflanzen:write"],
  };
  assert.deepEqual(checkDiscovery(ok), []);
  assert.deepEqual(
    checkDiscovery({ scopes_supported: ok.scopes_supported }),
    [],
    "absent field = off",
  );
  const bad = checkDiscovery({
    client_id_metadata_document_supported: true,
    scopes_supported: ["openid", "pflanzen:read"],
  });
  assert.equal(bad.length, 2);
  assert.match(bad[0], /cimd/);
  assert.match(bad[1], /pflanzen:draft, pflanzen:write/);
});

test("US-KI-07: a failed admin sign-in fails loudly and never prints the password", async () => {
  const fetchImpl = async () => new Response('{"error":"invalid_grant"}', { status: 401 });
  await assert.rejects(
    adminClient({ baseUrl: "http://kc", user: "admin", password: "s3cret-pw", fetchImpl }),
    (e) => {
      assert.match(e.message, /cannot sign in/);
      assert.doesNotMatch(e.message, /s3cret-pw/);
      return true;
    },
  );
});

test("US-KI-07: covers compares arrays as sets and objects as subsets", () => {
  assert.ok(covers({ a: ["x", "y"], b: 1, c: 2 }, { a: ["y", "x"], b: 1 }));
  assert.ok(!covers({ a: ["x"] }, { a: ["x", "y"] }));
  assert.ok(!covers({ a: { b: "1" } }, { a: { b: "2" } }));
  assert.ok(!covers(undefined, { a: 1 }));
});

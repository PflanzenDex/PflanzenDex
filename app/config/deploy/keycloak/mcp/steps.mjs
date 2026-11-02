// Idempotent steps that bring the realm `pflanzendex` to the target state of target-state.mjs (US-KI-07, TE-16): each
// reads first and writes only what differs, so a second run changes nothing. `kc` is the admin API of the realm:
// get(path), post(path, body), put(path, body), relative to /admin/realms/<realm>. No dependencies.
import {
  AUDIENCE_MAPPER_NAME,
  audienceMapperOf,
  CLIENT_AUDIENCE_KEY,
  covers,
  DCR_POLICIES,
  DCR_POLICY_TYPE,
  PKCE_POLICY,
  PKCE_PROFILE,
  RESOURCE_CLIENT_ID,
  resourceClientOf,
  SCOPES,
  scopeOf,
} from "./target-state.mjs";

// Creates `want` when `have` is missing, updates it (keeping the other fields) when it differs. Returns the change.
async function upsert(
  kc,
  { have, want, createPath, updatePath, label, merge = (h, w) => ({ ...h, ...w }), same = covers },
) {
  if (!have) {
    await kc.post(createPath, want);
    return [`created ${label}`];
  }
  if (same(have, want)) return [];
  await kc.put(updatePath(have), merge(have, want));
  return [`updated ${label}`];
}

const withAttributes = (key) => (have, want) => ({
  ...have,
  ...want,
  [key]: { ...have[key], ...want[key] },
});

// The audience mapper's config is replaced as a whole, so a client audience of an older run disappears.
const mapperIsSame = (have, want) => covers(have, want) && !have.config?.[CLIENT_AUDIENCE_KEY];
const replaceConfig = (have, want) => ({ ...have, ...want, config: { ...want.config } });

// 1. Client scopes as optional realm scopes (finding 3), each with the audience mapper (finding 1).
async function ensureScopes(kc, resourceUrl) {
  const mapper = audienceMapperOf(resourceUrl);
  const changes = [];
  let all = await kc.get("/client-scopes");
  for (const want of Object.entries(SCOPES).map(scopeOf)) {
    const have = all.find((s) => s.name === want.name);
    const update = (h) => `/client-scopes/${h.id}`;
    const label = `client scope ${want.name}`;
    changes.push(
      ...(await upsert(kc, {
        have,
        want,
        createPath: "/client-scopes",
        updatePath: update,
        label,
        merge: withAttributes("attributes"),
      })),
    );
  }
  all = await kc.get("/client-scopes");
  const ours = Object.keys(SCOPES).map((name) => all.find((s) => s.name === name));
  if (ours.some((s) => !s))
    throw new Error("a pflanzen:* client scope is missing after creating it");
  const optional = await kc.get("/default-optional-client-scopes");
  for (const scope of ours.filter((s) => !optional.some((o) => o.id === s.id))) {
    await kc.put(`/default-optional-client-scopes/${scope.id}`);
    changes.push(`made ${scope.name} an optional realm scope`);
  }
  for (const scope of ours) {
    const path = `/client-scopes/${scope.id}/protocol-mappers/models`;
    const have = (await kc.get(path)).find((m) => m.name === AUDIENCE_MAPPER_NAME);
    const label = `audience mapper on ${scope.name}`;
    changes.push(
      ...(await upsert(kc, {
        have,
        want: mapper,
        createPath: path,
        updatePath: (h) => `${path}/${h.id}`,
        label,
        merge: replaceConfig,
        same: mapperIsSame,
      })),
    );
  }
  return changes;
}

// 2. The MCP endpoint as a resource: a client with the attribute resource_url (feature resource-indicators).
async function ensureResourceClient(kc, resourceUrl) {
  const want = resourceClientOf(resourceUrl);
  const [have] = await kc.get(`/clients?clientId=${encodeURIComponent(RESOURCE_CLIENT_ID)}`);
  const label = `resource client ${RESOURCE_CLIENT_ID} (resource_url ${resourceUrl})`;
  return upsert(kc, {
    have,
    want,
    createPath: "/clients",
    updatePath: (h) => `/clients/${h.id}`,
    label,
    merge: withAttributes("attributes"),
  });
}

// 3. Anonymous client registration: trusted redirect hosts and the allowed scopes (findings 2 and 3).
async function ensureDcrPolicies(kc) {
  const changes = [];
  const components = await kc.get(`/components?type=${encodeURIComponent(DCR_POLICY_TYPE)}`);
  for (const policy of DCR_POLICIES) {
    const have = components.find((c) => c.name === policy.name && c.subType === policy.subType);
    if (!have) {
      const parentId = (await kc.get("")).id;
      await kc.post("/components", { ...policy, providerType: DCR_POLICY_TYPE, parentId });
      changes.push(`created registration policy "${policy.name}"`);
    } else if (!covers(have.config, policy.config)) {
      await kc.put(`/components/${have.id}`, {
        ...have,
        config: { ...have.config, ...policy.config },
      });
      changes.push(`updated registration policy "${policy.name}"`);
    }
  }
  return changes;
}

// 4. Client profile and policy for PKCE S256. The lists are replaced as a whole; other entries are kept as they are.
async function ensureClientPolicy(kc, { path, key, want, label }) {
  const list = (await kc.get(path))[key] ?? [];
  const have = list.find((p) => p.name === want.name);
  if (have && covers(have, want)) return [];
  await kc.put(path, { [key]: [...list.filter((p) => p !== have), want] });
  return [`${have ? "updated" : "created"} ${label} ${want.name}`];
}

/** Brings the realm to the target state. Returns the list of changes (empty = nothing to do). */
export async function setupMcpRealm(kc, { resourceUrl }) {
  if (!/^https?:\/\/[^/]+\/.+/.test(resourceUrl ?? ""))
    throw new Error(`AI_RESOURCE_URL is not a URL: ${resourceUrl}`);
  return [
    ...(await ensureScopes(kc, resourceUrl)),
    ...(await ensureResourceClient(kc, resourceUrl)),
    ...(await ensureDcrPolicies(kc)),
    ...(await ensureClientPolicy(kc, {
      path: "/client-policies/profiles",
      key: "profiles",
      want: PKCE_PROFILE,
      label: "client profile",
    })),
    ...(await ensureClientPolicy(kc, {
      path: "/client-policies/policies",
      key: "policies",
      want: PKCE_POLICY,
      label: "client policy",
    })),
  ];
}

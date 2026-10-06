// Sets up the spike realm: realm, users, scopes. Idempotent (409 is tolerated).
import { admin, KC, REALM } from "./kc-lib.mjs";
console.log("Keycloak:", KC);
await admin("", {
  method: "POST",
  realm: "",
  body: {
    realm: REALM,
    enabled: true,
    internationalizationEnabled: true,
    supportedLocales: ["de", "en"],
    defaultLocale: "de",
    registrationAllowed: false,
  },
});
await admin("/users", {
  method: "POST",
  body: {
    username: "alice",
    enabled: true,
    email: "alice@example.test",
    emailVerified: true,
    firstName: "Alice",
    lastName: "Test",
    credentials: [{ type: "password", value: "alice", temporary: false }],
  },
});
const scopes = {
  "pflanzen:read": "Read plant data",
  "pflanzen:draft": "Create drafts",
  "pflanzen:write": "Write reversible changes",
};
for (const [name, desc] of Object.entries(scopes)) {
  await admin("/client-scopes", {
    method: "POST",
    body: {
      name,
      description: desc,
      protocol: "openid-connect",
      attributes: {
        "include.in.token.scope": "true",
        "display.on.consent.screen": "true",
        "consent.screen.text": desc,
      },
    },
  });
}
const all = await admin("/client-scopes");
for (const s of all.filter((s) => s.name in scopes)) {
  await admin(`/default-optional-client-scopes/${s.id}`, {
    method: "PUT",
  }).catch((e) => console.log("optional:", e.message));
}
console.log(
  "Scopes angelegt:",
  all.filter((s) => s.name in scopes).map((s) => s.name),
);
const comps = await admin(
  "/components?type=org.keycloak.services.clientregistration.policy.ClientRegistrationPolicy",
);
console.log(
  "DCR-Policies:",
  comps
    .map((c) => `${c.name} [${c.subType}] ${JSON.stringify(c.config)}`)
    .join("\n  "),
);

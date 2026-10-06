// CIMD policy: client ID URLs only from trusted domains (claude.ai, chatgpt.com), resource only for the MCP server.
import { KC, REALM } from "./kc-lib.mjs";
const MCP = process.argv[2];
const domains = [
  "claude.ai",
  "chatgpt.com",
  ...(process.env.EXTRA_DOMAIN ? [process.env.EXTRA_DOMAIN] : []),
];
const t = (
  await (
    await fetch(`${KC}/realms/master/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: "admin-cli",
        username: "admin",
        password: "admin",
      }),
    })
  ).json()
).access_token;
const put = async (p, body) => {
  const r = await fetch(`${KC}/admin/realms/${REALM}/client-policies/${p}`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${t}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  console.log(p, r.status, r.ok ? "" : await r.text());
};
await put("profiles", {
  profiles: [
    {
      name: "cimd-mcp",
      description: "CIMD for MCP clients (spike TE-15)",
      executors: [
        {
          executor: "client-id-metadata-document",
          configuration: {
            "cimd-allow-http-scheme": false,
            "cimd-allow-permitted-domains": domains,
            "cimd-restrict-same-domain": false,
            "cimd-resource-indicator-allow-list": [MCP],
            "only-allow-confidential-client": false,
            "accept-public-client-with-confidential-client-only-grant":
              process.env.ACCEPT_PUBLIC === "true" ? "true" : "false",
          },
        },
      ],
    },
  ],
});
await put("policies", {
  policies: [
    {
      name: "cimd-mcp-policy",
      description: "Applies to URL client IDs",
      enabled: true,
      conditions: [
        {
          condition: "client-id-uri",
          configuration: {
            "client-id-uri-scheme": ["https"],
            "client-id-uri-allow-permitted-domains": domains,
          },
        },
      ],
      profiles: ["cimd-mcp"],
    },
  ],
});

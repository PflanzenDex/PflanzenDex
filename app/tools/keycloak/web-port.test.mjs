// #202: redirect URIs of the Keycloak web client per worktree port
import test from "node:test";
import assert from "node:assert/strict";
import { withWebPort, parsePort } from "./web-port.mjs";

const client = {
  id: "abc",
  redirectUris: ["http://localhost:5173/*"],
  webOrigins: ["http://localhost:5173"],
  attributes: {
    "pkce.code.challenge.method": "S256",
    "post.logout.redirect.uris": "http://localhost:5173/*",
  },
};

test("#202: adds redirect URI, web origin and logout redirect for the port", () => {
  const out = withWebPort(client, 55802);
  assert.deepEqual(out.redirectUris, ["http://localhost:5173/*", "http://localhost:55802/*"]);
  assert.deepEqual(out.webOrigins, ["http://localhost:5173", "http://localhost:55802"]);
  assert.equal(
    out.attributes["post.logout.redirect.uris"],
    "http://localhost:5173/*##http://localhost:55802/*",
  );
  assert.equal(out.attributes["pkce.code.challenge.method"], "S256");
});

test("#202: is idempotent and does not mutate its input", () => {
  const once = withWebPort(client, 55802);
  assert.deepEqual(withWebPort(once, 55802), once);
  assert.deepEqual(client.redirectUris, ["http://localhost:5173/*"]);
});

test("#202: handles a client without lists or attributes", () => {
  const out = withWebPort({ id: "x" }, 54900);
  assert.deepEqual(out.redirectUris, ["http://localhost:54900/*"]);
  assert.equal(out.attributes["post.logout.redirect.uris"], "http://localhost:54900/*");
});

test("#202: rejects ports that are not valid", () => {
  assert.equal(parsePort("55802"), 55802);
  for (const bad of ["abc", "0", "70000", "1.5"]) assert.throws(() => parsePort(bad));
});

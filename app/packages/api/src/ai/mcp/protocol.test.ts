import { describe, expect, it } from "vitest";
import {
  checkMedia,
  classify,
  errorStatus,
  headerValue,
  LEGACY_VERSIONS,
  MODERN_VERSION,
  negotiate,
  RPC,
  type Call,
  type Reply,
} from "./protocol";
import { NOT_RELEASED_CALLS } from "@pflanzendex/core";
import { checkArguments, describeTool, MCP_TOOLS, NOT_RELEASED_TOOLS, toolRight } from "./tools";

// FR-KI-03, FR-KI-06: contract tests of the MCP wire format (JSON-RPC 2.0, Streamable HTTP, dual-era versioning).
const meta = (version = MODERN_VERSION) => ({
  "io.modelcontextprotocol/protocolVersion": version,
  "io.modelcontextprotocol/clientCapabilities": {},
});
const modernHeaders = (method: string, name?: string) => ({
  version: MODERN_VERSION,
  method,
  ...(name ? { name } : {}),
});
const tool = (name: string) => {
  const t = MCP_TOOLS.find((x) => x.name === name);
  if (!t) throw new Error(`no tool ${name}`);
  return t;
};
const reply = (r: Call | Reply) => r as Reply & { body: { error: { code: number } } };

describe("US-KI-07 FR-KI-06 MCP messages", () => {
  it("US-KI-07 a legacy request runs with the header's version or 2025-03-26", () => {
    expect(classify({ jsonrpc: "2.0", id: 1, method: "tools/list" }, {})).toMatchObject({
      kind: "call",
      modern: false,
      version: "2025-03-26",
    });
    const unknown = reply(
      classify({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { version: "1900-01-01" }),
    );
    expect([unknown.status, unknown.body.error.code]).toEqual([400, RPC.unsupportedVersion]);
  });

  it("US-KI-07 a modern request needs matching headers, a version we speak and the client capabilities", () => {
    const body = (version?: string, extra = {}) => ({
      jsonrpc: "2.0",
      id: "a",
      method: "tools/call",
      params: { name: "get_status", _meta: meta(version), ...extra },
    });
    expect(classify(body(), modernHeaders("tools/call", "get_status"))).toMatchObject({
      kind: "call",
      modern: true,
    });
    const encoded = `=?base64?${Buffer.from("get_status").toString("base64")}?=`;
    expect(classify(body(), modernHeaders("tools/call", encoded))).toMatchObject({ modern: true });
    for (const h of [
      modernHeaders("tools/call"),
      modernHeaders("tools/list", "get_status"),
      { method: "tools/call", name: "get_status" },
    ])
      expect(reply(classify(body(), h)).body.error.code).toBe(RPC.headerMismatch);
    const old = reply(classify(body("2025-11-25"), modernHeaders("tools/call", "get_status")));
    expect(old.status).toBe(400);
    expect(old.body).toMatchObject({
      error: { code: RPC.unsupportedVersion, data: { requested: "2025-11-25" } },
    });
    const noCaps = reply(
      classify(
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: { _meta: { "io.modelcontextprotocol/protocolVersion": MODERN_VERSION } },
        },
        modernHeaders("tools/list"),
      ),
    );
    expect([noCaps.status, noCaps.body.error.code]).toEqual([400, RPC.invalidParams]);
  });

  it("US-KI-07 notifications and responses are accepted with 202, batches and broken messages refused", () => {
    expect(classify({ jsonrpc: "2.0", method: "notifications/initialized" }, {})).toEqual({
      status: 202,
    });
    expect(classify({ jsonrpc: "2.0", id: 9, result: {} }, {})).toEqual({ status: 202 });
    for (const raw of [
      [{ jsonrpc: "2.0", id: 1, method: "ping" }],
      { id: 1, method: "ping" },
      { jsonrpc: "2.0", id: 1 },
      { jsonrpc: "2.0", id: null, method: "ping" },
      { jsonrpc: "2.0", id: 1.5, method: "ping" },
    ])
      expect(reply(classify(raw, {})).body.error.code).toBe(RPC.invalidRequest);
    const params = reply(classify({ jsonrpc: "2.0", id: 1, method: "ping", params: [] }, {}));
    expect(params.body.error.code).toBe(RPC.invalidParams);
  });

  it("US-KI-07 initialize settles on the client's legacy version or our newest one", () => {
    expect(negotiate("2025-06-18")).toBe("2025-06-18");
    expect(negotiate("2024-11-05")).toBe(LEGACY_VERSIONS[0]);
    expect(negotiate(MODERN_VERSION)).toBe(LEGACY_VERSIONS[0]);
    expect(negotiate(undefined)).toBe(LEGACY_VERSIONS[0]);
  });

  it("US-KI-07 media types and HTTP statuses of errors follow the transport", () => {
    expect(checkMedia({ contentType: "application/json; charset=utf-8" })).toBeNull();
    expect(checkMedia({ contentType: "text/plain" })?.status).toBe(415);
    expect(checkMedia({ contentType: "application/json", accept: "text/html" })?.status).toBe(406);
    expect(
      checkMedia({
        contentType: "application/json",
        accept: "application/json, text/event-stream",
      }),
    ).toBeNull();
    expect(errorStatus({ modern: true }, RPC.methodNotFound)).toBe(404);
    expect(errorStatus({ modern: true }, RPC.invalidParams)).toBe(400);
    expect(errorStatus({ modern: true }, RPC.internalError)).toBe(200);
    expect(errorStatus({ modern: false }, RPC.methodNotFound)).toBe(200);
    expect(headerValue(undefined)).toBeUndefined();
    expect(headerValue("plain")).toBe("plain");
  });
});

describe("FR-KI-12 FR-KI-03 the tools", () => {
  it("FR-KI-12 every tool has a released class, a snake_case name and a valid object schema", () => {
    const names = MCP_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of MCP_TOOLS) {
      expect(t.name).toMatch(/^[a-z][a-z0-9_]{0,63}$/);
      expect(["read", "drafts", "write"]).toContain(toolRight(t));
      expect(t.readOnly).toBe(toolRight(t) === "read");
      const s = t.inputSchema as {
        type: string;
        properties: Record<string, { type: unknown }>;
        required?: string[];
        additionalProperties: boolean;
      };
      expect([s.type, s.additionalProperties]).toEqual(["object", false]);
      for (const r of s.required ?? []) expect(Object.keys(s.properties)).toContain(r);
      for (const p of Object.values(s.properties)) expect(p.type).toBeDefined();
      expect(describeTool(t)).toMatchObject({ name: t.name, inputSchema: s });
    }
    expect(() => toolRight({ ...tool("get_session"), operation: "manage_connections" })).toThrow();
  });

  it("FR-BES-24 FR-KI-03 search_species tells the model what 'more' means and what to do then", () => {
    const description = tool("search_species").description;
    expect(description).toContain("When more is true, more species match than are listed");
    expect(description).toContain("more exact term");
  });

  it("FR-KI-03 the arguments are checked for required, unknown and wrongly typed fields", () => {
    const decide = tool("decide_discover_suggestion");
    expect(
      checkArguments(decide, { species: "Aloe", decision: "yes", timeZone: "Europe/Berlin" }),
    ).toEqual([]);
    const problems = checkArguments(decide, { species: 3, decision: "maybe", extra: true });
    expect(problems.map((p) => p.field).sort()).toEqual([
      "decision",
      "extra",
      "species",
      "timeZone",
    ]);
    const draft = tool("propose_draft");
    expect(
      checkArguments(draft, { type: "wish", source: "s", content: [], reference: null }),
    ).toEqual([{ field: "content", problem: "must be object" }]);
  });

  it("FR-KI-03 each tool builds the request of its route; ids are encoded", () => {
    const req = (name: string, args: Record<string, unknown>) => tool(name).request(args);
    expect(req("get_status", {})).toEqual({ method: "GET", path: "/mcp/status" });
    expect(req("get_discover_suggestions", { timeZone: "Europe/Berlin", zone: 3 }).path).toBe(
      "/mcp/discover/suggestions?timeZone=Europe%2FBerlin&zone=3",
    );
    expect(req("claim_task", { taskId: "../x" }).path).toBe("/mcp/tasks/..%2Fx/claim");
    expect(
      req("decide_discover_suggestion", {
        species: "A",
        decision: "no",
        timeZone: "UTC",
        idempotencyKey: "k",
      }),
    ).toEqual({
      method: "POST",
      path: "/mcp/discover/decisions",
      body: { species: "A", decision: "no", timeZone: "UTC" },
      idempotencyKey: "k",
    });
    expect(req("propose_draft", { type: "wish", source: "s", content: {} }).body).toEqual({
      reference: null,
      taskId: null,
      type: "wish",
      source: "s",
      content: {},
    });
  });

  it("US-QS-03 the write tools accept the key and forward it to their route; the draft body carries no key", () => {
    const draft = tool("propose_draft");
    const args = { type: "wish", source: "s", content: {}, idempotencyKey: "k" };
    expect(checkArguments(draft, args)).toEqual([]);
    const sent = draft.request(args);
    expect(sent).toMatchObject({ method: "POST", path: "/mcp/drafts", idempotencyKey: "k" });
    expect(sent.body).not.toHaveProperty("idempotencyKey");
    expect(tool("claim_task").request({ taskId: "t", idempotencyKey: "k" })).toMatchObject({
      path: "/mcp/tasks/t/claim",
      idempotencyKey: "k",
    });
    expect(tool("decline_task").request({ taskId: "t", idempotencyKey: "k" })).toMatchObject({
      path: "/mcp/tasks/t/decline",
      idempotencyKey: "k",
    });
    expect(tool("claim_task").request({ taskId: "t" })).not.toHaveProperty("idempotencyKey");
  });

  it("FR-KI-22 no human-only name is a tool, and the decided names are in the map of human-only names", () => {
    const toolNames = MCP_TOOLS.map((t) => t.name);
    const humanOnly = Object.keys(NOT_RELEASED_TOOLS);
    for (const name of humanOnly) expect(toolNames).not.toContain(name);
    for (const name of [
      "update_profile",
      "set_display_name",
      "subscribe_push",
      "unsubscribe_push",
      "set_calm_mode",
      "set_onboarding_style",
      "dismiss_onboarding_hint",
      "switch_feature",
      "account.switch_feature",
      "set_wish_visibility",
      "set_equipment_visibility",
      "decide_proposal",
      "list_review_proposals",
      "set_registration_mode",
      "create_invitation_code",
      "change_connection_rights",
      "revoke_connection",
      "accept_swap",
      "hand_over",
      "delete_account",
      "export_account",
    ])
      expect(humanOnly).toContain(name);
  });

  it("FR-KI-22 every subject of a human-only call has at least one name, so each call is reachable as a tool", () => {
    const subjects = new Set(Object.values(NOT_RELEASED_TOOLS));
    for (const subject of Object.keys(NOT_RELEASED_CALLS)) expect(subjects).toContain(subject);
  });
});

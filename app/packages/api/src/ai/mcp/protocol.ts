// The wire format of the MCP endpoint (E-04, ADR 0013): JSON-RPC 2.0 over Streamable HTTP, without an SDK. Pure
// functions: they classify a POST body and its headers and build the answers; the route runs the tools.
//
// Two eras of the protocol are served on the same endpoint (dual-era, MCP versioning):
// - modern (2026-07-28): every request carries its version in `params._meta`, mirrored in the headers
//   `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name`; there is no handshake and no session.
// - legacy (2025-11-25, 2025-06-18, 2025-03-26): an `initialize` handshake negotiates the version; this server stays
//   stateless (no `Mcp-Session-Id`) and answers every request with one JSON object.

export const MODERN_VERSION = "2026-07-28";
export const LEGACY_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"] as const;
export const SUPPORTED_VERSIONS: readonly string[] = [MODERN_VERSION, ...LEGACY_VERSIONS];
/** A legacy client that sends no `MCP-Protocol-Version` header speaks 2025-03-26 (transport spec, backwards compat.). */
const DEFAULT_LEGACY = "2025-03-26";

/** JSON-RPC 2.0 codes and the MCP codes of the reserved range (MCP base protocol, error codes). */
export const RPC = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
  headerMismatch: -32020,
  unsupportedVersion: -32022,
} as const;

const META_VERSION = "io.modelcontextprotocol/protocolVersion";
const META_CAPABILITIES = "io.modelcontextprotocol/clientCapabilities";
export const META_SERVER_INFO = "io.modelcontextprotocol/serverInfo";

export type RpcId = string | number;
export type Params = Readonly<Record<string, unknown>>;

/** One answer of the endpoint: HTTP status and either a JSON-RPC body or none (202). */
export interface Reply {
  readonly status: 200 | 202 | 400 | 403 | 404 | 406 | 415;
  readonly body?: object;
}

/** A request the server should run: its id, method, params and the era that decides the shape of the result. */
export interface Call {
  readonly kind: "call";
  readonly id: RpcId;
  readonly method: string;
  readonly params: Params;
  readonly modern: boolean;
  /** The protocol version of this request (modern: from `_meta`; legacy: header or 2025-03-26). */
  readonly version: string;
}

export const rpcError = (id: RpcId | null, code: number, message: string, data?: unknown) => ({
  jsonrpc: "2.0" as const,
  id,
  error: { code, message, ...(data === undefined ? {} : { data }) },
});

export const rpcResult = (id: RpcId, result: object) => ({ jsonrpc: "2.0" as const, id, result });

const fail = (status: Reply["status"], id: RpcId | null, code: number, message: string): Reply => ({
  status,
  body: rpcError(id, code, message),
});

/** 400 with the versions we speak, so a client can retry with one of them (MCP versioning, -32022). */
const unsupported = (id: RpcId, requested: unknown): Reply => ({
  status: 400,
  body: rpcError(id, RPC.unsupportedVersion, "Unsupported protocol version", {
    supported: SUPPORTED_VERSIONS,
    requested,
  }),
});

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isId = (v: unknown): v is RpcId =>
  typeof v === "string" || (typeof v === "number" && Number.isInteger(v));

/** Decodes the Base64 sentinel `=?base64?…?=` of `Mcp-Name` (transport spec, value encoding); plain values pass. */
export function headerValue(raw: string | undefined): string | undefined {
  const m = raw === undefined ? null : /^=\?base64\?([A-Za-z0-9+/=]*)\?=$/.exec(raw);
  return m ? Buffer.from(m[1] ?? "", "base64").toString("utf8") : raw;
}

/** Headers of the POST that the protocol reads (lower-case names). */
export interface WireHeaders {
  readonly contentType?: string | undefined;
  readonly accept?: string | undefined;
  readonly version?: string | undefined;
  readonly method?: string | undefined;
  readonly name?: string | undefined;
}

/** Content type JSON and an `Accept` that admits JSON (we never open an SSE stream); else 415 or 406. */
export function checkMedia(h: WireHeaders): Reply | null {
  if (!/^application\/json\b/i.test(h.contentType ?? ""))
    return fail(415, null, RPC.invalidRequest, "Content-Type must be application/json");
  const accept = h.accept;
  if (accept !== undefined && accept !== "" && !/application\/json|\*\/\*/i.test(accept))
    return fail(406, null, RPC.invalidRequest, "Accept must admit application/json");
  return null;
}

/** The modern header checks: version mirrored, `Mcp-Method` and, for `tools/call`, `Mcp-Name` match the body. */
function modernHeaders(call: Omit<Call, "kind" | "modern">, h: WireHeaders) {
  const { id, method, params, version } = call;
  const mismatch = (what: string) =>
    fail(
      400,
      id,
      RPC.headerMismatch,
      `Header mismatch: ${what} is missing or differs from the body`,
    );
  if (h.version !== version) return mismatch("MCP-Protocol-Version");
  if (h.method !== method) return mismatch("Mcp-Method");
  if (method === "tools/call" && headerValue(h.name) !== params["name"])
    return mismatch("Mcp-Name");
  return null;
}

/** A request with `_meta.protocolVersion`: served statelessly per 2026-07-28 or refused with the versions we speak. */
function modernCall(id: RpcId, method: string, params: Params, h: WireHeaders): Call | Reply {
  const meta = params["_meta"] as Record<string, unknown>;
  const version = meta[META_VERSION];
  if (version !== MODERN_VERSION) return unsupported(id, version);
  if (!isObject(meta[META_CAPABILITIES]))
    return fail(400, id, RPC.invalidParams, `_meta is missing ${META_CAPABILITIES}`);
  const call = { id, method, params, version };
  return modernHeaders(call, h) ?? { kind: "call", ...call, modern: true };
}

/** A request without `_meta` version: legacy; the header, when sent, must name a legacy version we speak. */
function legacyCall(id: RpcId, method: string, params: Params, h: WireHeaders): Call | Reply {
  const version = h.version ?? DEFAULT_LEGACY;
  if (method !== "initialize" && !(LEGACY_VERSIONS as readonly string[]).includes(version))
    return unsupported(id, version);
  return { kind: "call", id, method, params, modern: false, version };
}

/**
 * Classifies a POST body (MCP transports: one JSON-RPC message per POST). A notification or a response is accepted with
 * 202 and no body; a batch (an array) is refused, since 2025-06-18 and 2026-07-28 allow none. Returns the call to run
 * or the reply to send as is.
 */
export function classify(raw: unknown, h: WireHeaders): Call | Reply {
  if (Array.isArray(raw))
    return fail(400, null, RPC.invalidRequest, "Batches are not supported: one message per POST");
  if (!isObject(raw) || raw["jsonrpc"] !== "2.0")
    return fail(400, null, RPC.invalidRequest, "Not a JSON-RPC 2.0 message");
  const { id, method } = raw;
  if (typeof method !== "string")
    return "result" in raw || "error" in raw
      ? { status: 202 }
      : fail(400, null, RPC.invalidRequest, "method is missing");
  if (id === undefined) return { status: 202 };
  if (!isId(id)) return fail(400, null, RPC.invalidRequest, "id must be a string or an integer");
  const params = raw["params"] ?? {};
  if (!isObject(params)) return fail(400, id, RPC.invalidParams, "params must be an object");
  const meta = params["_meta"];
  return isObject(meta) && META_VERSION in meta
    ? modernCall(id, method, params, h)
    : legacyCall(id, method, params, h);
}

/** The version a legacy `initialize` settles on: the client's if we speak it, else our newest legacy one. */
export function negotiate(requested: unknown): string {
  return typeof requested === "string" && (LEGACY_VERSIONS as readonly string[]).includes(requested)
    ? requested
    : LEGACY_VERSIONS[0];
}

/** HTTP status of a JSON-RPC error: modern requests map unknown methods to 404 and bad params to 400. */
export function errorStatus(call: Pick<Call, "modern">, code: number): Reply["status"] {
  if (!call.modern) return 200;
  if (code === RPC.methodNotFound) return 404;
  return code === RPC.invalidParams ? 400 : 200;
}

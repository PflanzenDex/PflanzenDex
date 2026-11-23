// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  accountKey,
  appendKey,
  createKey,
  createQueryClient,
  createWrite,
  entityKey,
  forgetRepeatKeys,
  releaseRepeatKey,
  runRepeat,
  useClearOnSignOut,
  type KeyScope,
  type Response,
  type WriteOptions,
} from "../index";
import { describeConflict } from "./describe-saved";
import { useWriteAction } from "./use-write-action";

afterEach(() => {
  cleanup();
  forgetRepeatKeys();
  vi.restoreAllMocks();
});

/**
 * A server that keeps one record per Idempotency-Key and applies each new key once, as the API does: a key that comes back
 * with the same request is answered with the stored answer, with another request it is refused (`idempotency.key_conflict`).
 * The first `lost` answers are lost on the way back: the write is applied, the client sees a network error. `applied` lists
 * the writes that changed something, so a replay shows as a missing entry.
 */
function keyServer(lost = 0) {
  const records = new Map<string, string>();
  const keys: string[] = [];
  const applied: string[] = [];
  let left = lost;
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
    const key = (init?.headers as Record<string, string>)["Idempotency-Key"] ?? "";
    const request = `${init?.method} ${String(url)} ${String(init?.body ?? "")}`;
    keys.push(key);
    const seen = records.get(key);
    if (seen !== undefined && seen !== request)
      return new Response(
        JSON.stringify({ error: { code: "idempotency.key_conflict", text: "x" } }),
        { status: 409 },
      );
    if (seen === undefined) {
      records.set(key, request);
      applied.push(`${init?.method} ${String(url).replace("http://api", "")}`);
    }
    if (left > 0) {
      left -= 1;
      throw new TypeError("Failed to fetch");
    }
    return new Response("{}", { status: 201 });
  });
  return { fetchFn, keys, applied };
}

/** A write of the tests: one request through the write layer with the options of the action (US-QS-03). */
const send =
  (fetchFn: typeof fetch, method: "POST" | "PUT" | "DELETE", path: string, body?: unknown) =>
  (t: string, options: WriteOptions) =>
    createWrite<unknown>("http://api", t, { ...options, fetchFn })(method, path, body);

/** Runs one action of a page; the answer is the write's own. */
function tap(
  hook: ReturnType<typeof useWriteAction>,
  run: ReturnType<typeof send>,
  scope: KeyScope,
) {
  return act(async () => hook.run(run, "Gesichert.", scope));
}

describe("US-QS-03 · the repeat-guard key of an action, held per target", () => {
  it("US-QS-03 archive, restore, archive: a success on the specimen frees the lost archive's key, the third archive really archives", async () => {
    const server = keyServer(1);
    const { result } = renderHook(() =>
      useWriteAction(
        async () => "tok",
        () => undefined,
      ),
    );
    const archive = send(server.fetchFn, "POST", "/specimens/e1/archive", { reason: "x" });
    const restore = send(server.fetchFn, "POST", "/specimens/e1/restore");
    const target = entityKey("specimen", "e1", "archive:x");
    await tap(result.current, archive, target);
    expect(result.current.error?.code).toBe("network.not_reachable");
    await tap(result.current, restore, entityKey("specimen", "e1", "restore"));
    expect(result.current.error).toBeNull();
    await tap(result.current, archive, target);
    expect(result.current.error).toBeNull();
    expect(server.applied).toEqual([
      "POST /specimens/e1/archive",
      "POST /specimens/e1/restore",
      "POST /specimens/e1/archive",
    ]);
  });

  it("US-QS-03 water, undo, water again across two hooks: the second water is a write of its own", async () => {
    const server = keyServer(1);
    const water = renderHook(() =>
      useWriteAction(
        async () => "tok",
        () => undefined,
      ),
    );
    const undo = renderHook(() =>
      useWriteAction(
        async () => "tok",
        () => undefined,
      ),
    );
    const plant = (action: string): KeyScope => entityKey("specimen", "e2", action);
    await tap(
      water.result.current,
      send(server.fetchFn, "POST", "/care/water", { ids: ["e2"] }),
      plant("water"),
    );
    expect(water.result.current.error?.code).toBe("network.not_reachable");
    await tap(
      undo.result.current,
      send(server.fetchFn, "DELETE", "/care/water/e2"),
      plant("unwater:2026-11-20"),
    );
    expect(undo.result.current.error).toBeNull();
    await tap(
      water.result.current,
      send(server.fetchFn, "POST", "/care/water", { ids: ["e2"] }),
      plant("water"),
    );
    expect(water.result.current.error).toBeNull();
    expect(server.applied).toEqual([
      "POST /care/water",
      "DELETE /care/water/e2",
      "POST /care/water",
    ]);
  });

  it("US-QS-03 deletion request, cancel, request again: the cancel frees the lost request's key, the second request is applied", async () => {
    const server = keyServer(1);
    const { result } = renderHook(() =>
      useWriteAction(
        async () => "tok",
        () => undefined,
      ),
    );
    const request = send(server.fetchFn, "POST", "/account/deletion", { confirm: true });
    const cancel = send(server.fetchFn, "DELETE", "/account/deletion");
    await tap(result.current, request, accountKey("deletion:request"));
    expect(result.current.error?.code).toBe("network.not_reachable");
    await tap(result.current, cancel, accountKey("deletion:cancel"));
    await tap(result.current, request, accountKey("deletion:request"));
    expect(result.current.error).toBeNull();
    expect(server.applied).toEqual([
      "POST /account/deletion",
      "DELETE /account/deletion",
      "POST /account/deletion",
    ]);
  });

  it("US-QS-03 a refusal frees only its own action: a lost archive keeps its key when a restore is refused", async () => {
    const server = keyServer(1);
    const refusing = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ error: { code: "input.invalid", text: "x" } }), {
          status: 400,
        }),
    );
    const { result } = renderHook(() =>
      useWriteAction(
        async () => "tok",
        () => undefined,
      ),
    );
    const archive = send(server.fetchFn, "POST", "/specimens/e3/archive", { reason: "x" });
    await tap(result.current, archive, entityKey("specimen", "e3", "archive:x"));
    await tap(
      result.current,
      send(refusing, "POST", "/specimens/e3/restore"),
      entityKey("specimen", "e3", "restore"),
    );
    expect(result.current.error?.code).toBe("input.invalid");
    await tap(result.current, archive, entityKey("specimen", "e3", "archive:x"));
    expect(server.keys[1]).toBe(server.keys[0]);
    expect(server.applied).toEqual(["POST /specimens/e3/archive"]);
  });

  it("US-QS-03 a lost answer on row A, then row B, then a retap of A: B gets a key of its own, A reuses its key", async () => {
    const server = keyServer(1);
    const { result } = renderHook(() =>
      useWriteAction(
        async () => "tok",
        () => undefined,
      ),
    );
    const write = (id: string) =>
      send(server.fetchFn, "POST", `/specimens/${id}/measurements`, { value: 1 });
    await tap(result.current, write("a"), entityKey("specimen", "a", "measure:1"));
    expect(result.current.error?.code).toBe("network.not_reachable");
    await tap(result.current, write("b"), entityKey("specimen", "b", "measure:1"));
    expect(server.keys[1]).not.toBe(server.keys[0]);
    expect(result.current.error).toBeNull();
    await tap(result.current, write("a"), entityKey("specimen", "a", "measure:1"));
    expect(server.keys[2]).toBe(server.keys[0]);
    expect(result.current.error).toBeNull();
  });

  it("US-QS-03 forgetRepeatKeys: a lost answer's key is not repeated after it is forgotten", async () => {
    const server = keyServer(1);
    const { result } = renderHook(() =>
      useWriteAction(
        async () => "tok",
        () => undefined,
      ),
    );
    const save = send(server.fetchFn, "POST", "/measurements", { value: 1 });
    const scope = entityKey("specimen", "e4", "measure:1");
    await tap(result.current, save, scope);
    forgetRepeatKeys();
    await tap(result.current, save, scope);
    expect(server.keys[1]).not.toBe(server.keys[0]);
    expect(result.current.error).toBeNull();
  });

  it("US-QS-03 the end of the signed-in state (sign-out) clears the held keys: the next account gets fresh keys", async () => {
    const server = keyServer(1);
    const queries = createQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queries}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() =>
      useWriteAction(
        async () => "tok",
        () => undefined,
      ),
    );
    const save = send(server.fetchFn, "POST", "/measurements", { value: 1 });
    const scope = entityKey("specimen", "e5", "measure:1");
    await tap(result.current, save, scope);
    expect(result.current.error?.code).toBe("network.not_reachable");
    renderHook(() => useClearOnSignOut(false), { wrapper });
    await tap(result.current, save, scope);
    expect(server.keys[1]).not.toBe(server.keys[0]);
    expect(result.current.error).toBeNull();
  });

  it("US-QS-03 an append's conflict keeps its key: another edited tap is refused too, the original body replays the stored answer", async () => {
    const server = keyServer(1);
    const { result } = renderHook(() =>
      useWriteAction(
        async () => "tok",
        () => undefined,
      ),
    );
    const scope = appendKey("specimen", "e6", "measure");
    const measure = (value: number) =>
      send(server.fetchFn, "POST", "/specimens/e6/measurements", { value });
    await tap(result.current, measure(1), scope);
    expect(result.current.error?.code).toBe("network.not_reachable");
    await tap(result.current, measure(2), scope);
    expect(result.current.error?.code).toBe("idempotency.key_conflict");
    await tap(result.current, measure(3), scope);
    expect(result.current.error?.code).toBe("idempotency.key_conflict");
    await tap(result.current, measure(1), scope);
    expect(result.current.error).toBeNull();
    expect(new Set(server.keys).size).toBe(1);
    expect(server.applied).toEqual(["POST /specimens/e6/measurements"]);
  });

  it("US-QS-03 a set-state's conflict frees its key: the next edited tap is a fresh write and is applied (it only sets state)", async () => {
    const server = keyServer(1);
    const { result } = renderHook(() =>
      useWriteAction(
        async () => "tok",
        () => undefined,
      ),
    );
    const scope = entityKey("specimen", "e6", "notes");
    const notes = (text: string) =>
      send(server.fetchFn, "PUT", "/specimens/e6/notes", { notes: text });
    await tap(result.current, notes("A"), scope);
    expect(result.current.error?.code).toBe("network.not_reachable");
    await tap(result.current, notes("B"), scope);
    expect(result.current.error?.code).toBe("idempotency.key_conflict");
    await tap(result.current, notes("B"), scope);
    expect(result.current.error).toBeNull();
    expect(server.keys[2]).not.toBe(server.keys[0]);
    expect(server.applied).toEqual(["PUT /specimens/e6/notes", "PUT /specimens/e6/notes"]);
  });

  it("US-QS-03 a set-state success on the target does not free a held append's key: the retap repeats it, one record", async () => {
    const server = keyServer(1);
    const { result } = renderHook(() =>
      useWriteAction(
        async () => "tok",
        () => undefined,
      ),
    );
    const scope = appendKey("specimen", "e6", "measure");
    const measure = send(server.fetchFn, "POST", "/specimens/e6/measurements", { value: 1 });
    await tap(result.current, measure, scope);
    expect(result.current.error?.code).toBe("network.not_reachable");
    await tap(
      result.current,
      send(server.fetchFn, "PUT", "/specimens/e6/notes", { notes: "x" }),
      entityKey("specimen", "e6", "notes"),
    );
    expect(result.current.error).toBeNull();
    await tap(result.current, measure, scope);
    expect(result.current.error).toBeNull();
    expect(server.keys[2]).toBe(server.keys[0]);
    expect(server.applied).toEqual(["POST /specimens/e6/measurements", "PUT /specimens/e6/notes"]);
  });

  it("US-QS-03 another refusal of the same action frees its conflicting append key: the next edited write gets a key of its own", async () => {
    const server = keyServer(1);
    const refusing = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ error: { code: "input.invalid", text: "x" } }), {
          status: 400,
        }),
    );
    const { result } = renderHook(() =>
      useWriteAction(
        async () => "tok",
        () => undefined,
      ),
    );
    const scope = appendKey("specimen", "e7", "measure");
    const measure = (value: number) =>
      send(server.fetchFn, "POST", "/specimens/e7/measurements", { value });
    await tap(result.current, measure(1), scope);
    await tap(result.current, measure(2), scope);
    expect(result.current.error?.code).toBe("idempotency.key_conflict");
    await tap(
      result.current,
      send(refusing, "POST", "/specimens/e7/measurements", { value: 2 }),
      scope,
    );
    expect(result.current.error?.code).toBe("input.invalid");
    await tap(result.current, measure(2), scope);
    expect(result.current.error).toBeNull();
    expect(server.keys[2]).not.toBe(server.keys[0]);
    expect(server.applied).toEqual([
      "POST /specimens/e7/measurements",
      "POST /specimens/e7/measurements",
    ]);
  });

  it("US-QS-03 a lost create, a silent seen mark, then a retap of the create: one record (a silent write frees nothing)", async () => {
    const server = keyServer(1);
    const { result } = renderHook(() =>
      useWriteAction(
        async () => "tok",
        () => undefined,
      ),
    );
    const create = createKey("specimen", "create");
    await tap(result.current, send(server.fetchFn, "POST", "/specimens", { name: "a" }), create);
    expect(result.current.error?.code).toBe("network.not_reachable");
    await act(async () =>
      result.current.runSilent(send(server.fetchFn, "PUT", "/seen", { ids: ["x"] }), ""),
    );
    await tap(result.current, send(server.fetchFn, "POST", "/specimens", { name: "a" }), create);
    expect(result.current.error).toBeNull();
    expect(server.keys[2]).toBe(server.keys[0]);
    expect(server.applied).toEqual(["POST /specimens", "PUT /seen"]);
  });

  it("US-QS-03 a lost create keeps its key when a successful write of another entity lands: the create lives on its own target", async () => {
    const server = keyServer(1);
    const { result } = renderHook(() =>
      useWriteAction(
        async () => "tok",
        () => undefined,
      ),
    );
    const create = createKey("specimen", "create");
    await tap(result.current, send(server.fetchFn, "POST", "/specimens", { name: "a" }), create);
    await tap(
      result.current,
      send(server.fetchFn, "POST", "/wishes", { name: "w" }),
      createKey("wish", "create"),
    );
    expect(result.current.error).toBeNull();
    await tap(result.current, send(server.fetchFn, "POST", "/specimens", { name: "a" }), create);
    expect(result.current.error).toBeNull();
    expect(server.keys[2]).toBe(server.keys[0]);
    expect(server.applied).toEqual(["POST /specimens", "POST /wishes"]);
  });

  it("US-QS-03 a tap without a token (nothing sent) keeps the held key: the next tap with a token repeats it, one record", async () => {
    const server = keyServer(1);
    let token: string | undefined = "tok";
    const { result } = renderHook(() =>
      useWriteAction(
        async () => token,
        () => undefined,
      ),
    );
    const scope = appendKey("specimen", "e9", "measure");
    const save = send(server.fetchFn, "POST", "/specimens/e9/measurements", { value: 1 });
    await tap(result.current, save, scope);
    expect(result.current.error?.code).toBe("network.not_reachable");
    token = undefined;
    await tap(result.current, save, scope);
    expect(result.current.error?.code).toBe("access.not_signed_in");
    expect(server.keys).toHaveLength(1);
    token = "tok";
    await tap(result.current, save, scope);
    expect(result.current.error).toBeNull();
    expect(new Set(server.keys).size).toBe(1);
    expect(server.applied).toEqual(["POST /specimens/e9/measurements"]);
  });

  it("US-QS-03 the sign-out-everywhere press is held by the registry: a repeat repeats its key, forgetRepeatKeys frees it", async () => {
    const server = keyServer(1);
    const press = () =>
      runRepeat(accountKey("sign-out-everywhere"), (key) =>
        createWrite("http://api", "tok", { key, fetchFn: server.fetchFn })(
          "POST",
          "/account/sessions/end",
        ),
      );
    await press();
    await press();
    expect(server.keys[1]).toBe(server.keys[0]);
    forgetRepeatKeys();
    await press();
    expect(server.keys[2]).not.toBe(server.keys[0]);
    expect(server.applied).toEqual(["POST /account/sessions/end", "POST /account/sessions/end"]);
  });
});

/**
 * The source of the web app (`src`), read for the check of the key scopes below. The suite runs from the package
 * directory (`npm run test` in `app/packages/web`); the jsdom environment gives no file URL to resolve from.
 */
const SRC = join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the web package's own src folder, read by this check only
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sourceFiles(join(dir, e.name)) : [join(dir, e.name)],
  );
}

/** The text of each `entityKey(` and `accountKey(` call, up to its closing parenthesis. */
function keyCalls(text: string): string[] {
  return [...text.matchAll(/\b(?:entityKey|accountKey)\(/g)].map((m) => {
    const start = m.index ?? 0;
    let depth = 1;
    let i = start + m[0].length;
    for (; i < text.length && depth > 0; i += 1) {
      if (text[i] === "(") depth += 1;
      else if (text[i] === ")") depth -= 1;
    }
    return text.slice(start, i);
  });
}

/** A refusal of a key that comes back after its write is done: the conflict carries the saved result in `data.saved`. */
const conflictWith = (saved: unknown): Response<unknown> =>
  ({
    ok: false,
    error: { code: "idempotency.key_conflict", text: "x", data: { saved } },
  }) as unknown as Response<unknown>;

describe("US-QS-03 · a key conflict names what is saved", () => {
  it("US-QS-03 a conflict after a finished write carries its saved result, and the description of its write names it", async () => {
    const scope = appendKey("specimen", "e9", "measure");
    const r = await runRepeat(scope, async () => conflictWith({ value: 12 }));
    expect(!r.ok && r.error.code).toBe("idempotency.key_conflict");
    const named = !r.ok
      ? describeConflict(r.error, (saved) => `${(saved as { value: number }).value} cm`)
      : null;
    expect(named?.conflictText).toBe(
      "Gesichert ist: 12 cm. Deine Änderung ist noch nicht gesichert.",
    );
  });

  it("US-QS-03 a conflict whose write names no description keeps no conflict text: the text of the code says the first entry is saved", async () => {
    const r = await runRepeat(appendKey("specimen", "e9b", "measure"), async () =>
      conflictWith({ value: 12 }),
    );
    expect(!r.ok && r.error.conflictText).toBeUndefined();
  });

  it("US-QS-03 dismissing a conflict of an append frees its key: the next edited tap is a fresh write", async () => {
    const server = keyServer(1);
    const { result } = renderHook(() =>
      useWriteAction(
        async () => "tok",
        () => undefined,
      ),
    );
    const scope = appendKey("specimen", "e10", "measure");
    const measure = (value: number) =>
      send(server.fetchFn, "POST", "/specimens/e10/measurements", { value });
    await tap(result.current, measure(1), scope);
    expect(result.current.error?.code).toBe("network.not_reachable");
    await tap(result.current, measure(2), scope);
    expect(result.current.error?.code).toBe("idempotency.key_conflict");
    releaseRepeatKey(scope);
    await tap(result.current, measure(2), scope);
    expect(result.current.error).toBeNull();
    expect(server.keys[2]).not.toBe(server.keys[0]);
    expect(server.applied).toEqual([
      "POST /specimens/e10/measurements",
      "POST /specimens/e10/measurements",
    ]);
  });
});

describe("US-QS-03 · the action of a repeat-guard key names the operation, never the body", () => {
  const files = sourceFiles(SRC).filter(
    (f) => /\.tsx?$/.test(f) && !/\.(test|stories)\.tsx?$/.test(f) && !f.endsWith(".fixtures.tsx"),
  );

  it("US-QS-03 no entityKey or accountKey call takes JSON.stringify of a body: the body is not part of the key", () => {
    expect(existsSync(join(SRC, "shared/data/write-action/repeat-key.ts"))).toBe(true);
    const hits: string[] = [];
    let calls = 0;
    for (const file of files)
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- a file found under the same src folder
      for (const call of keyCalls(readFileSync(file, "utf8"))) {
        calls += 1;
        if (/JSON\.stringify/.test(call)) hits.push(`${relative(SRC, file)}: ${call.slice(0, 90)}`);
      }
    expect(calls).toBeGreaterThan(80);
    expect(hits).toEqual([]);
  });

  it("US-QS-03 the check flags a body in a key and passes a key of the operation", () => {
    const body = (text: string) => keyCalls(text).some((c) => /JSON\.stringify/.test(c));
    expect(body("accountKey(`create:${JSON.stringify(input)}`)")).toBe(true);
    expect(body('entityKey("lamp", lamp.id, `data:${JSON.stringify(\n  data,\n)}`)')).toBe(true);
    expect(body('accountKey("first-plant:create")')).toBe(false);
    expect(body('entityKey("specimen", id, `undo:${ids.join(",")}`)')).toBe(false);
  });
});

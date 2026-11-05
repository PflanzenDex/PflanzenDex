import { describe, expect, it } from "vitest";
import { sharedTreeCache } from "./cards-cache";

// FR-POK-13, NFR-12: the shared part of the collector cards is read once per taxonomy build. The fake source counts the
// reads and changes the build version by hand, so every case is deterministic (no database).
function fakeSource(initial: string | null) {
  const state = {
    version: initial,
    versionReads: 0,
    treeReads: 0,
    versionFails: false,
    treeFails: false,
  };
  const source = {
    async version() {
      state.versionReads += 1;
      if (state.versionFails) throw new Error("version read failed");
      return state.version;
    },
    async tree() {
      state.treeReads += 1;
      if (state.treeFails) throw new Error("tree read failed");
      return `tree of ${state.version}`;
    },
  };
  return { source, state };
}

describe("FR-POK-13 the shared tree of the collector cards", () => {
  it("FR-POK-13 answers from the kept tree while the build version is unchanged", async () => {
    const { source, state } = fakeSource("v1");
    const read = sharedTreeCache(source);
    expect(await read()).toBe("tree of v1");
    expect(await read()).toBe("tree of v1");
    expect(await read()).toBe("tree of v1");
    expect(state.treeReads).toBe(1);
    expect(state.versionReads).toBe(3);
  });

  it("FR-POK-13 reads the tree again when a build changes the version (the next request shows the new catalog)", async () => {
    const { source, state } = fakeSource("v1");
    const read = sharedTreeCache(source);
    await read();
    state.version = "v2";
    expect(await read()).toBe("tree of v2");
    expect(state.treeReads).toBe(2);
  });

  it("FR-POK-13 keeps only the newest version: going back to an older build reads it again", async () => {
    const { source, state } = fakeSource("v1");
    const read = sharedTreeCache(source);
    await read();
    state.version = "v2";
    await read();
    state.version = "v1";
    expect(await read()).toBe("tree of v1");
    expect(state.treeReads).toBe(3);
  });

  it("FR-POK-13 a failed tree read surfaces as an error and is not kept: the next read asks again", async () => {
    const { source, state } = fakeSource("v1");
    const read = sharedTreeCache(source);
    state.treeFails = true;
    await expect(read()).rejects.toThrow("tree read failed");
    state.treeFails = false;
    expect(await read()).toBe("tree of v1");
    expect(state.treeReads).toBe(2);
  });

  it("FR-POK-13 a failed build of a new version never serves the tree of the old one (P-10)", async () => {
    const { source, state } = fakeSource("v1");
    const read = sharedTreeCache(source);
    await read();
    state.version = "v2";
    state.treeFails = true;
    await expect(read()).rejects.toThrow("tree read failed");
    state.treeFails = false;
    expect(await read()).toBe("tree of v2");
  });

  it("FR-POK-13 a failed version read is an error, never the kept tree (P-10)", async () => {
    const { source, state } = fakeSource("v1");
    const read = sharedTreeCache(source);
    await read();
    state.versionFails = true;
    await expect(read()).rejects.toThrow("version read failed");
    expect(state.treeReads).toBe(1);
    state.versionFails = false;
    expect(await read()).toBe("tree of v1");
  });

  it("FR-POK-13 without a build yet the tree is read on every request and nothing is kept", async () => {
    const { source, state } = fakeSource(null);
    const read = sharedTreeCache(source);
    expect(await read()).toBe("tree of null");
    expect(await read()).toBe("tree of null");
    expect(state.treeReads).toBe(2);
  });

  it("NFR-12 concurrent first reads both answer with the same tree and later reads use the kept entry", async () => {
    const { source, state } = fakeSource("v1");
    const read = sharedTreeCache(source);
    const [a, b] = await Promise.all([read(), read()]);
    expect(a).toBe("tree of v1");
    expect(b).toBe("tree of v1");
    expect(state.treeReads).toBeLessThanOrEqual(2);
    const reads = state.treeReads;
    expect(await read()).toBe("tree of v1");
    expect(state.treeReads).toBe(reads);
  });
});

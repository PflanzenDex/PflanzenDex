// The shared part of the collector cards (FR-POK-13, NFR-12) in process memory: the taxonomy tree, which every account
// reads alike and which changes only with a taxonomy build. Only that tree is kept. Caught state, photos, catch dates,
// own proposals, app rarity (US-POK-14) and the catalog facts are read per request: they differ per account, change
// without a build, or (the facts) are not versioned by the build.

/** The two reads behind the cache: the version of the stored tree and the tree itself. */
export interface TreeVersionSource<T> {
  /** One small read: the version of the stored tree, `null` before the first build. */
  version(): Promise<string | null>;
  tree(): Promise<T>;
}

/** The answer of the cache: `built` is `false` before the first taxonomy build, then `tree` is what the build left. */
export interface SharedTree<T> {
  readonly built: boolean;
  readonly tree: T;
}

/**
 * Returns a reader of the tree that answers from the kept entry while the version is unchanged. One entry only: a new
 * version replaces it. The version is read first, then the tree, so a build committed in between stores a newer tree
 * under an older key, which the next read misses. A failed read is an error and is not kept (P-10), so a build that
 * failed never serves the tree of the one before. Concurrent first reads may both read the tree; both answers are right.
 */
export function sharedTreeCache<T>(source: TreeVersionSource<T>): () => Promise<SharedTree<T>> {
  let kept: { readonly version: string; readonly tree: T } | null = null;
  return async () => {
    const version = await source.version();
    if (version === null) {
      kept = null;
      return { built: false, tree: await source.tree() };
    }
    if (kept !== null && kept.version === version) return { built: true, tree: kept.tree };
    const tree = await source.tree();
    kept = { version, tree };
    return { built: true, tree };
  };
}

import { useEffect, useState } from "react";
import type { ApiError } from "../../data";

/** Where to and as whom a private photo is fetched (P-05). */
export interface PhotoAccess {
  readonly api: string;
  readonly token: () => Promise<string | undefined>;
}

/** `thumb` is the 256 px thumbnail that tiles and cards ask for (NFR-12); without a size the stored copy comes. */
export type PhotoSize = "thumb";

export interface PhotoOptions {
  readonly size?: PhotoSize;
  /** `false` holds the request back, e.g. until the picture is near the viewport (NFR-12). Default `true`. */
  readonly enabled?: boolean;
}

/** An object URL once loaded, an error with its code if not, `null` while loading. */
type Loaded = string | ApiError | null;

const FAILED: ApiError = { code: "network.not_reachable", text: "Nicht erreichbar." };

/** Bounds of the blob cache (NFR-12, starting values, assumption): entries, and the bytes they hold. */
const MAX_ENTRIES = 200;
const MAX_BYTES = 32 * 1024 * 1024;

/** One request: its object URL once loaded, how many components show it, and whether the cache has let go of it. */
interface Entry {
  readonly key: string;
  readonly answer: Promise<Loaded>;
  url: string | null;
  bytes: number;
  refs: number;
  evicted: boolean;
}

/**
 * The loaded photos by request address, least recently used first (NFR-12): a tile that scrolls away and back is not
 * fetched again. An object URL is revoked only when it has left the cache and no component shows it any more, so a
 * picture on screen never loses its address.
 */
const cache = new Map<string, Entry>();
let cachedBytes = 0;

const revoke = (entry: Entry) => {
  if (entry.url) URL.revokeObjectURL(entry.url);
  entry.url = null;
};

/** Takes the entry out of the cache; a picture still on screen is revoked when its last component lets go. */
const evict = (entry: Entry) => {
  cache.delete(entry.key);
  cachedBytes -= entry.bytes;
  entry.bytes = 0;
  entry.evicted = true;
  if (entry.refs === 0) revoke(entry);
};

const trim = () => {
  for (;;) {
    if (cache.size <= MAX_ENTRIES && cachedBytes <= MAX_BYTES) return;
    const oldest = cache.values().next();
    if (oldest.done) return;
    evict(oldest.value);
  }
};

async function download(
  url: string,
  token: PhotoAccess["token"],
): Promise<{ ok: true; blob: Blob } | { ok: false; error: ApiError }> {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${await token()}` } });
    if (res.ok) return { ok: true, blob: await res.blob() };
    const body = (await res.json()) as { error?: ApiError };
    return { ok: false, error: body.error ?? FAILED };
  } catch {
    return { ok: false, error: FAILED };
  }
}

/** Settles a request: the object URL is kept in the cache, a failure is not (the next mount asks again). */
function settle(entry: Entry, r: Awaited<ReturnType<typeof download>>): Loaded {
  if (!r.ok) {
    if (cache.get(entry.key) === entry) cache.delete(entry.key);
    entry.evicted = true;
    return r.error;
  }
  entry.url = URL.createObjectURL(r.blob);
  entry.bytes = r.blob.size;
  if (entry.evicted) {
    if (entry.refs === 0) revoke(entry);
  } else {
    cachedBytes += entry.bytes;
    trim();
  }
  return entry.url;
}

function acquire(url: string, token: PhotoAccess["token"]): Entry {
  const known = cache.get(url);
  if (known) {
    cache.delete(url);
    cache.set(url, known); // most recently used goes last
    known.refs += 1;
    return known;
  }
  const entry: Entry = {
    key: url,
    answer: download(url, token).then((r) => settle(entry, r)),
    url: null,
    bytes: 0,
    refs: 1,
    evicted: false,
  };
  cache.set(url, entry);
  trim();
  return entry;
}

function release(entry: Entry) {
  entry.refs -= 1;
  if (entry.refs === 0 && entry.evicted) revoke(entry);
}

/** Empties the cache, e.g. at sign-out: pictures nobody shows are revoked, shown ones when they leave the screen. */
export function clearPhotoCache(): void {
  for (const entry of [...cache.values()]) evict(entry);
}

/**
 * Forgets the pictures under an API path after one changed, so the replaced picture leaves memory at once. A replaced
 * photo has a new address (its version changes, NFR-12), so the next view fetches it anew.
 */
export function forgetPhotos(api: string, pathPrefix: string): void {
  const prefix = `${api}${pathPrefix}`;
  for (const entry of [...cache.values()]) if (entry.key.startsWith(prefix)) evict(entry);
}

/** The request address: the path may carry a query already (the version of a photo), the size joins it with `&`. */
const address = (api: string, path: string, size: PhotoSize | undefined) => {
  if (!size) return `${api}${path}`;
  return `${api}${path}${path.includes("?") ? "&" : "?"}size=${size}`;
};

/**
 * Loads a private photo from the API path with the token (P-05, US-WAC-05): the bytes never sit behind a public link and
 * are shown from an object URL. `size: "thumb"` asks the 256 px thumbnail (NFR-12). Loaded pictures are cached by their
 * request (bounded, see above). `undefined` path or `enabled: false`: nothing is requested.
 */
export function useStoredPhoto(
  { api, token }: PhotoAccess,
  path: string | undefined,
  options: PhotoOptions = {},
): Loaded {
  const { size, enabled = true } = options;
  const url = path && enabled ? address(api, path, size) : null;
  const [loaded, setLoaded] = useState<{ url: string; value: Loaded } | null>(null);
  useEffect(() => {
    if (!url) return;
    const entry = acquire(url, token);
    let active = true;
    void entry.answer.then((value) => {
      if (active)
        setLoaded((prev) => (prev?.url === url && prev.value === value ? prev : { url, value }));
    });
    return () => {
      active = false;
      release(entry);
    };
  }, [url, token]);
  return url && loaded?.url === url ? loaded.value : null;
}

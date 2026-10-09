import type { SourceRequest } from "../../kernel";

// Wikimedia Commons as the only image source of a wish (US-WUN-04): only its own addresses are accepted, so a
// keeper-typed address can never make the server contact another host (no hotlinking, no SSRF), and only licenses that
// allow storing are used (assumption, decided by the PO: public domain, CC0, CC BY, CC BY-SA).

const FILE_PAGE = /^https:\/\/commons\.wikimedia\.org\/wiki\/File:([^/?#@\s]+)$/;
const UPLOAD =
  /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/[0-9a-f]\/[0-9a-f]{2}\/([^/?#@\s]+)$/;

/** The Commons file title of an address, `File:Name with spaces.jpg`; `null` for anything that is not a Commons file. */
export function commonsTitle(address: string): string | null {
  const name = (FILE_PAGE.exec(address) ?? UPLOAD.exec(address))?.[1];
  if (!name) return null;
  try {
    return `File:${decodeURIComponent(name).replaceAll("_", " ")}`;
  } catch {
    return null;
  }
}

/** Asks the Commons API for download address, license and author of one file. */
export const commonsRequest = (title: string): SourceRequest => ({
  source: "commons",
  path: "/w/api.php",
  query: {
    action: "query",
    titles: title,
    prop: "imageinfo",
    iiprop: "url|mime|extmetadata",
    format: "json",
  },
});

export interface CommonsFile {
  /** Where the original is downloaded from (always on `upload.wikimedia.org`). */
  readonly downloadUrl: string;
  readonly license: string;
  /** Author (if known) and the file page: the source of the image (P-08). */
  readonly source: string;
}

export type CommonsReading =
  | { readonly ok: true; readonly file: CommonsFile }
  | { readonly ok: false; readonly reason: "not_found" | "license_unsupported" };

/** Licenses that allow storing a copy: public domain, CC0, CC BY and CC BY-SA (no NC, no ND). */
const SOURCE_MAX = 300;
const VERSION = /^\d(\.\d)?$/;
const LOCALE = /^[a-z]{2,3}$/;

/** "CC BY 4.0", "CC BY-SA 3.0 de": the free Creative Commons licenses, without NC and ND. */
function isCcBy(license: string): boolean {
  const [cc, kind, version, locale, ...rest] = license.split(" ");
  return (
    cc === "cc" &&
    (kind === "by" || kind === "by-sa") &&
    VERSION.test(version ?? "") &&
    (locale === undefined || LOCALE.test(locale)) &&
    rest.length === 0
  );
}

function isFree(license: string): boolean {
  const l = license.toLowerCase();
  return l === "public domain" || l.startsWith("cc0") || /^pd\b/.test(l) || isCcBy(l);
}

type Meta = Record<string, { value?: unknown }>;
const text = (meta: Meta, key: string): string => {
  const v = meta[key]?.value;
  return typeof v === "string" ? v.trim() : "";
};

/** Plain text of the author field (HTML in the API answer): tags go, and no angle bracket survives. */
const stripTags = (html: string): string =>
  html
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();

interface ImageInfo {
  readonly url: string;
  readonly descriptionurl: string;
  readonly extmetadata: Meta;
}

const firstInfo = (data: unknown): Partial<ImageInfo> | undefined => {
  const pages = (data as { query?: { pages?: Record<string, unknown> } } | null)?.query?.pages;
  const page = pages ? Object.values(pages)[0] : undefined;
  return (page as { imageinfo?: Partial<ImageInfo>[] } | undefined)?.imageinfo?.[0];
};

/** The first `imageinfo` of the answer if it has an address on Wikimedia's upload host; `null` otherwise. */
function imageInfo(data: unknown): ImageInfo | null {
  const info = firstInfo(data);
  const { url, descriptionurl } = info ?? {};
  if (!url?.startsWith("https://upload.wikimedia.org/") || !descriptionurl) return null;
  return { url, descriptionurl, extmetadata: info?.extmetadata ?? {} };
}

/** Reads the Commons API answer; nothing is assumed: a missing license is "unsupported", not "free". */
export function readCommons(data: unknown): CommonsReading {
  const info = imageInfo(data);
  if (!info) return { ok: false, reason: "not_found" };
  const meta = info.extmetadata;
  const license = text(meta, "LicenseShortName");
  if (!isFree(license) || text(meta, "NonFree").toLowerCase() === "true")
    return { ok: false, reason: "license_unsupported" };
  const author = stripTags(text(meta, "Artist")).slice(0, 100);
  const source = author ? `${author}, ${info.descriptionurl}` : info.descriptionurl;
  // The database keeps at most 300 characters (WISH_LIMITS.imageSource); a longer credit falls back to the file page.
  if (source.length > SOURCE_MAX) {
    if (info.descriptionurl.length > SOURCE_MAX) return { ok: false, reason: "not_found" };
    return { ok: true, file: { downloadUrl: info.url, license, source: info.descriptionurl } };
  }
  return { ok: true, file: { downloadUrl: info.url, license, source } };
}

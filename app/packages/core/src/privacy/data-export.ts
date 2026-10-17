import { appError, failed, ok, type Result } from "../kernel";
import type { ObjectStore } from "../media";

// Export of all data of one account (US-ACC-04, P-04): `data.json` with every table row the keeper owns plus the photos
// as files. Pure: where the rows come from is the port `AccountDataSource` (adapter in `db`), where the photos come
// from the `ObjectStore`; the ZIP container is built in the API. Nothing in here reads a clock or a random number, so
// the same data gives the same bytes ("reproducible").

export const EXPORT_FORMAT = { format: "pflanzendex-export", version: 1 } as const;

export type ExportRow = Readonly<Record<string, unknown>>;

/** Where a photo is mentioned: the row's column holds the object name below the account prefix of the store. */
export interface PhotoRef {
  readonly table: string;
  readonly column: string;
  readonly name: string;
}

export interface AccountDataSnapshot {
  /** Table name to its rows, ordered by the adapter in a fixed way. Credentials are already left out. */
  readonly tables: Readonly<Record<string, readonly ExportRow[]>>;
  readonly photos: readonly PhotoRef[];
}

export interface AccountDataSource {
  /** `null` when the account does not exist. */
  read(accountId: string): Promise<AccountDataSnapshot | null>;
}

export interface ArchiveFile {
  /** Path inside the archive, `/` separated, without leading slash. */
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface DataExport {
  /** The text of `data.json` (UTF-8 without byte order mark; the container encodes it). */
  readonly dataJson: string;
  /** The photo files `photos/<name>`, sorted by path. */
  readonly files: readonly ArchiveFile[];
  /** Photos that a row names but the store no longer holds; they are listed in `data.json`, never dropped (P-10). */
  readonly missingPhotos: number;
}

export interface DataExportDependencies {
  readonly source: AccountDataSource;
  readonly photos: ObjectStore;
}

/** JSON with keys sorted at every level and two spaces of indentation: one canonical text per value. */
export function canonicalJson(value: unknown): string {
  const sorted = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sorted);
    if (v !== null && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, x]) => [k, sorted(x)]),
      );
    return v;
  };
  return `${JSON.stringify(sorted(value), null, 2)}\n`;
}

const photoPath = (name: string) => `photos/${name}`;

/**
 * Collects the data of the account. A photo missing in the store is noted in the document (`file: null`) and the
 * export goes on; any other store error stops it, because a silent gap would be a wrong export (P-10).
 */
export async function exportAccountData(
  deps: DataExportDependencies,
  accountId: string,
): Promise<Result<DataExport>> {
  const snapshot = await deps.source.read(accountId);
  if (!snapshot) return failed(appError("access.denied"));
  const names = [...new Set(snapshot.photos.map((p) => p.name))].sort();
  const files: ArchiveFile[] = [];
  const missing = new Set<string>();
  for (const name of names) {
    const got = await deps.photos.get(accountId, name);
    if (got.ok) files.push({ path: photoPath(name), bytes: got.value.bytes });
    else if (got.error.code === "media.not_found") missing.add(name);
    else return got;
  }
  const document = {
    ...EXPORT_FORMAT,
    tables: snapshot.tables,
    photos: [...snapshot.photos]
      .sort((a, b) => a.name.localeCompare(b.name) || a.table.localeCompare(b.table))
      .map((p) => ({ ...p, file: missing.has(p.name) ? null : photoPath(p.name) })),
  };
  return ok({ dataJson: canonicalJson(document), files, missingPhotos: missing.size });
}

import { appError, failed, ok } from "../kernel";
import type { ErrorCode, Result } from "../kernel";
import { objectKey, putKey } from "./keys";
import type { ImageProcessor, ObjectStore, ProcessedImage, StoredObject } from "./types";

/** Pure in-memory `ObjectStore` for tests (TE-05). Follows the same key rules as every adapter. */
export class InMemoryObjectStore implements ObjectStore {
  private readonly objects = new Map<string, StoredObject>();

  async put(a: string, name: string, bytes: Uint8Array, type: string): Promise<Result<void>> {
    const key = putKey(a, name, bytes, type);
    if (!key.ok) return key;
    this.objects.set(key.value, { bytes: new Uint8Array(bytes), contentType: type });
    return ok(undefined);
  }

  async get(a: string, name: string): Promise<Result<StoredObject>> {
    const key = objectKey(a, name);
    if (!key.ok) return key;
    const found = this.objects.get(key.value);
    return found ? ok(found) : failed(appError("media.not_found"));
  }

  async delete(a: string, name: string): Promise<Result<void>> {
    const key = objectKey(a, name);
    if (key.ok) this.objects.delete(key.value);
    return key.ok ? ok(undefined) : key;
  }

  async exists(a: string, name: string): Promise<Result<boolean>> {
    const key = objectKey(a, name);
    return key.ok ? ok(this.objects.has(key.value)) : key;
  }

  objectCount(): number {
    return this.objects.size;
  }

  /** True when any stored object equals `bytes` (proves an original was or was not stored). */
  containsBytes(bytes: Uint8Array): boolean {
    return [...this.objects.values()].some(
      (o) => o.bytes.length === bytes.length && o.bytes.every((b, i) => b === bytes[i]),
    );
  }
}

/** Processor that returns fixed output (or a refusal) and counts its calls. */
export class FakeImageProcessor implements ImageProcessor {
  calls = 0;
  readonly output: ProcessedImage = {
    bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 9, 9]),
    contentType: "image/jpeg",
    width: 800,
    height: 600,
  };

  constructor(private readonly refusal: ErrorCode | null = null) {}

  async process(): Promise<Result<ProcessedImage>> {
    this.calls += 1;
    return this.refusal ? failed(appError(this.refusal)) : ok(this.output);
  }
}

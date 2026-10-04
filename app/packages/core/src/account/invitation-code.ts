/** Validity of an invitation code in days (assumption, starting value; the operator picks within the limits). */
export const INVITATION_VALIDITY_DAYS = { min: 1, default: 7, max: 30 } as const;

// Crockford base32: no I, L, O, U, so a code read aloud or typed from a screen has no look-alikes.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_BYTES = 15; // 120 bits = 24 characters of 5 bits each
const CODE_LENGTH = (CODE_BYTES * 8) / 5;
const GROUP = 4;

/**
 * A new invitation code from a cryptographically secure source (`random(n)` must return n CSPRNG bytes; core has no
 * I/O, the API passes `crypto.randomBytes`). 120 bits are not guessable; shown as six groups of four.
 */
export function newInvitationCode(random: (bytes: number) => Uint8Array): string {
  const bytes = random(CODE_BYTES);
  if (bytes.length !== CODE_BYTES) throw new Error(`Expected ${CODE_BYTES} random bytes`);
  let bits = 0;
  let buffer = 0;
  let out = "";
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(buffer >> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  const groups: string[] = [];
  for (let i = 0; i < out.length; i += GROUP) groups.push(out.slice(i, i + GROUP));
  return groups.join("-");
}

const LOOK_ALIKES: Record<string, string> = { O: "0", I: "1", L: "1" };

/**
 * The code as the store knows it: upper case, without spaces and hyphens, look-alikes mapped (O to 0, I and L to 1).
 * `null` for anything that cannot be a code. A single linear scan, no pattern matching on user input.
 */
export function normalizeInvitationCode(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 200) return null;
  let out = "";
  for (const char of raw.toUpperCase()) {
    if (char === "-" || char === " ") continue;
    const mapped = LOOK_ALIKES[char] ?? char;
    if (!ALPHABET.includes(mapped) || out.length === CODE_LENGTH) return null;
    out += mapped;
  }
  return out.length === CODE_LENGTH ? out : null;
}

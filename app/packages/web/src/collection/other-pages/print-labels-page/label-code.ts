// What a pot label holds (US-BES-17, FR-BES-25). Only this module imports uqr; the page that uses it is a lazy chunk,
// so the encoder stays out of the first load (QG-U6).
import { encode } from "uqr";

/**
 * The address a label holds: the app's address of one plant with its opaque specimen id. No name, species, location or
 * account goes into the code (P-05), so a printed label reveals nothing without a sign-in.
 */
export const labelAddress = (origin: string, specimenId: string): string =>
  `${origin}/label/${encodeURIComponent(specimenId)}`;

/**
 * The dark and light modules of the QR code of an address, with the four-module quiet zone of the standard included
 * (medium error correction, starting value, assumption). `QrCode` draws them as inline SVG.
 */
export function qrModules(address: string): boolean[][] {
  return encode(address, { ecc: "M", border: 4 }).data;
}

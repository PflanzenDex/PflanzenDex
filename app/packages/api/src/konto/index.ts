// Öffentliche Schnittstelle des Moduls `konto` (ADR 0003): Anmeldung und Kontoroute.
export { authentifizierung, nurMitBestaetigterEmail } from "./auth/middleware";
export { erstelleTokenPruefer } from "./auth/token";
export type { TokenPruefer } from "./auth/token";
export { kontoRouten } from "./konto-routen";

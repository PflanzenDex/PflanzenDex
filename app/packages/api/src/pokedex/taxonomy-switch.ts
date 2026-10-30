/**
 * Whether the hourly taxonomy check runs (US-POK-03, #991). It asks foreign servers (OpenTree, Wikidata, Wikipedia),
 * but it has always run, so the default stays "on"; `TAXONOMY_BUILD=off` stops the check (the handler stays
 * registered, so an already queued build still ends cleanly). Any other non-empty value stops the start (P-10).
 */
export function taxonomyBuildEnabled(env: { TAXONOMY_BUILD?: string | undefined }): boolean {
  const value = (env.TAXONOMY_BUILD ?? "").trim();
  if (value === "" || value === "on") return true;
  if (value === "off") return false;
  throw new Error(`TAXONOMY_BUILD must be "on" or "off", got "${value}"`);
}

import type { TenantExceptions } from "../kernel/index.ts";

// The catalog tables have no account id: knowledge that belongs to everyone. They are still visible only by review
// status, so they need enforced row rules: without a rule, private proposals would be readable by all (P-05).
// The kernel knows none of this; `schema-check.ts` composes it into the tenant check.
export const CATALOG_TENANT_EXCEPTIONS: TenantExceptions = {
  withoutAccountId: {
    species:
      "Shared species catalog (E-02): knowledge that belongs to everyone. Visible are approved species and the own proposals, determined by the review case (species_status(), FR-BES-11); the application can neither change nor delete (BES-01)",
    species_name:
      "Names and synonyms of a species: visible and creatable exactly like the associated species (species_status(), species_own())",
    catalog_source_snapshot:
      "Raw answers of the open sources per species (US-BES-12, DM-BES-05): shared like the catalog, visible like the species (species_status()); read-only for the application role, written only by the fill job (owner role)",
    catalog_field_provenance:
      "Origin, source, license and date of every catalog value (US-BES-12, DM-BES-06, FR-BES-12): shared like the catalog, visible like the species (species_status()); read-only for the application role, written only by the fill job (owner role)",
  },
  ruleRequired: ["species", "species_name"],
};

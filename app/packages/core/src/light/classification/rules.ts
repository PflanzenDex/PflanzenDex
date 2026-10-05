// Reference text for the classification rules (US-LIC-04). Static, not account data; the zone table comes from the
// account's zones, the collection table from the light overview (US-LIC-03). The numbers are the derivation
// constants (US-LIC-01), never a copy (P-08). German texts are UI texts.
import { GAP_MAX, PROMOTE_FROM } from "../derive";

export interface ClassificationIndicator {
  readonly key: string;
  readonly text: string;
}

export interface ClassificationWarning {
  readonly key: string;
  readonly sign: string;
  readonly action: string;
}

export interface ClassificationRules {
  readonly indicators: readonly ClassificationIndicator[];
  readonly warnings: readonly ClassificationWarning[];
  readonly thresholds: {
    readonly promoteFromPercent: number;
    readonly stayBelowGapPercent: number;
  };
}

const INDICATORS: readonly ClassificationIndicator[] = [
  { key: "cam_arid", text: "CAM-Stoffwechsel und aride Herkunft (Wüste, Halbwüste)" },
  { key: "full_sun", text: "Die Herkunftsangabe nennt Vollsonne" },
  { key: "thick_cuticle", text: "Dicke Kutikula, wachsig oder bereift" },
  { key: "spines", text: "Dornen oder Stacheln als Schutz vor starker Strahlung" },
];

const WARNINGS: readonly ClassificationWarning[] = [
  {
    key: "etiolation",
    sign: "Vergeilung: lange, blasse Triebe mit großen Abständen zwischen den Blättern",
    action: "Prüfe die Lichtzone der Art und stelle die Pflanze näher an die Lampe.",
  },
  {
    key: "light_stress",
    sign: "Ausbleichen, Verbrennungen oder rötliche Verfärbung der Blätter",
    action: "Prüfe, ob die Zone zu hoch ist, und stelle die Pflanze eine Zone tiefer.",
  },
  {
    key: "soft_leaf",
    sign: "Weiche Blätter bei einer sonnenliebenden C3-Pflanze",
    action: "Stufe sie nicht automatisch in die starke Zone ein, sondern beobachte das Wachstum.",
  },
  {
    key: "no_demand",
    sign: "Kein Lux-Bedarf hinterlegt",
    action: "Trage den Lux-Bedarf der Art ein, bis dahin bleibt die Zone unbekannt.",
  },
];

/** The reference on levels, indicators and warning signs shown on the page "Licht" (US-LIC-04). */
export function classificationRules(): ClassificationRules {
  return {
    indicators: INDICATORS,
    warnings: WARNINGS,
    thresholds: {
      promoteFromPercent: (PROMOTE_FROM.counter * 100) / PROMOTE_FROM.denominator,
      stayBelowGapPercent: 100 - (GAP_MAX.counter * 100) / GAP_MAX.denominator,
    },
  };
}

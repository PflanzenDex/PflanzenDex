import type { Pool } from "pg";
import { daysAgo, type Ctx } from "../../accounts/common/shared.ts";

// Roles, the review queue and the operator area (TE-08, US-BES-10, US-ACC-05, US-BES-13).

/**
 * Clara gets the reviewer and the operator role. Roles are the installation operator's job and are written on the owner
 * connection, like `ensureOperatorAccount` does; no API route grants them (the application role may not write
 * `account_role`). Idempotent.
 */
export async function grantRoles(pool: Pool, sub: string): Promise<void> {
  for (const role of ["reviewer", "operator"] as const)
    await pool.query(
      "insert into account_role (account, role) select id, $2 from account where subject = $1 on conflict do nothing",
      [sub, role],
    );
}

type Proposal = {
  latin: string;
  german: string;
  lux: number;
  /** Source of the light need; without it the case cannot be approved yet (FR-BES-14). */
  source?: string;
};

// Demo values (assumptions, marked as such in states/states-map.md): they are not measured data.
const PROPOSALS: readonly Proposal[] = [
  {
    latin: "Hoya kerrii",
    german: "Herzhoya",
    lux: 3000,
    source: "Demo-Quelle (Annahme, nicht gemessen)",
  },
  { latin: "Pilea glauca", german: "Blaugrüne Pilea", lux: 4000 },
];

const proposalBody = (p: { latin: string; german: string; lux: number; source?: string }) => ({
  latinName: p.latin,
  germanName: p.german,
  difficulty: 2,
  standardLevel: 3,
  lightDemandLux: p.lux,
  growthMeasure: "height",
  etiolationSigns: "Lange, dünne Triebe mit großen Abständen zwischen den Blättern.",
  successCriteria: "Neue Blätter kommen kompakt und dunkelgrün nach.",
  ...(p.source ? { source: p.source } : {}),
});

const listedNames = async (ctx: Ctx, q: string): Promise<string[]> =>
  (
    ((await ctx.api.ok(ctx.sub, "GET", `/species?q=${encodeURIComponent(q)}`))["species"] ??
      []) as { latinName: string }[]
  ).map((s) => s.latinName);

/**
 * Ben proposes two species (US-BES-10): one with a source (approvable), one without (blocked: "Freigabe noch nicht
 * möglich"). Clara approves the first one, so the catalog gets an approved species, and the second stays open.
 * Then Ben proposes "Hoya kerri" next to the approved "Hoya kerrii": the similar-species hint (Dublette) shows.
 */
export async function reviewCases(ben: Ctx, clara: Ctx): Promise<void> {
  for (const p of PROPOSALS) {
    if ((await listedNames(ben, p.latin)).includes(p.latin)) continue;
    await ben.api.ok(ben.sub, "POST", "/species", proposalBody(p));
  }
  const open = (await clara.api.ok(clara.sub, "GET", "/review"))["entries"] as {
    reviewCase: { id: string; status: string };
    species: { latinName: string } | null;
  }[];
  // The queue lists open cases only: an approved one is not there any more, which is the second run.
  const kerrii = open.find((e) => e.species?.latinName === "Hoya kerrii");
  if (kerrii)
    await clara.api.ok(clara.sub, "POST", `/review/${kerrii.reviewCase.id}/decide`, {
      status: "reviewed",
    });
  if (!(await listedNames(ben, "Hoya kerri")).includes("Hoya kerri"))
    await ben.api.ok(
      ben.sub,
      "POST",
      "/species",
      proposalBody({ latin: "Hoya kerri", german: "Herz-Hoya", lux: 3000 }),
    );
}

/**
 * Operator area (US-ACC-05, NFR-16): a monthly cost figure (cost per user shows "manuell eingetragen") and one open
 * invitation (the code itself is shown once and not kept; only its state is seen in the overview). Idempotent.
 */
export async function operatorArea(clara: Ctx): Promise<void> {
  const month = daysAgo(0).slice(0, 7); // the current month in the keeper zone (NFR-08)
  await clara.api.ok(clara.sub, "PUT", "/operator/cost", {
    amountCents: 4200,
    currency: "EUR",
    month,
  });
  const overview = await clara.api.ok(clara.sub, "GET", "/operator/overview");
  const invitations = (overview["invitations"] ?? []) as { status: string }[];
  if (!invitations.some((i) => i.status === "open"))
    await clara.api.ok(clara.sub, "POST", "/operator/invitations", { validForDays: 7 });
}

import { daysAgo, TZ, type Ctx, type Id } from "../common/shared.ts";

/** Own care profiles for a few species: own dormancy window, watering intervals, own hints (US-BES-09). */
export async function seedCareProfiles(
  ctx: Ctx,
  species: Map<string, Id>,
  locations: Map<string, Id>,
): Promise<void> {
  const { api, sub } = ctx;
  const winter = locations.get("Schlafzimmer");
  const plans: [string, number, number, string][] = [
    ["Ficus lyrata", 7, 21, "Immer am selben Platz lassen, dreht sonst Blätter ab."],
    ["Aloe vera", 14, 42, "Im Winter fast trocken halten."],
    ["Crassula ovata", 14, 35, "Hell und kühl überwintern."],
    ["Phalaenopsis amabilis", 7, 14, "Tauchen statt gießen."],
  ];
  for (const [latin, growth, dormancy, hint] of plans) {
    const id = species.get(latin);
    if (!id) continue;
    await api.ok(sub, "PUT", `/care-profiles/${id}`, {
      wateringGrowthDays: growth,
      wateringDormancyDays: dormancy,
      dormancyFrom: "10-10",
      dormancyUntil: "02-28",
      ...(winter ? { dormancyLocationId: winter } : {}),
      ownHints: hint,
    });
  }
}

/** A running course of treatments and one finished treatment; skipped when the account already has treatments. */
export async function seedTreatments(ctx: Ctx, ids: readonly Id[]): Promise<void> {
  const { api, sub } = ctx;
  const open = await api.ok(sub, "GET", `/treatments?timeZone=${TZ}`);
  if (JSON.stringify(open).includes("Trauermücken")) return;
  const [a, b, c, d] = ids;
  if (!a || !b || !c || !d) return;
  const course = await api.ok(sub, "POST", "/treatments", {
    specimenIds: [a, b],
    reason: "Wollläuse",
    agent: "Neemöl",
    date: daysAgo(10),
    count: 3,
    intervalDays: 7,
  });
  await api.ok(sub, "POST", "/treatments", {
    specimenIds: [c],
    reason: "Trauermücken",
    agent: "Nematoden",
    date: daysAgo(2),
  });
  // One finished treatment, so the history is not empty.
  const done = await api.ok(sub, "POST", "/treatments", {
    specimenIds: [d],
    reason: "Schildläuse",
    agent: "Spiritus",
    date: daysAgo(40),
  });
  const list = ((await api.ok(sub, "GET", `/treatments?timeZone=${TZ}`))["treatments"] ?? []) as {
    id: Id;
    reason?: string;
  }[];
  const old = list.find((t) => t.reason === "Schildläuse");
  if (old) await api.ok(sub, "POST", `/treatments/${old.id}/complete`, { timeZone: TZ });
  ctx.log(
    `Ben: treatments written (${Object.keys(course).length + Object.keys(done).length} fields)`,
  );
}

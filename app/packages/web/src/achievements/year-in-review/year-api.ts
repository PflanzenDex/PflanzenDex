import { call, currentTimeZone, type Response } from "../../kernel";

export type YearPhoto = { measurementId: string; date: string };
export type YearAnswer =
  | { calmMode: true }
  | {
      calmMode: false;
      year: number;
      hasData: boolean;
      counts: {
        speciesCaught: number;
        cuttingsRooted: number;
        treatmentsCompleted: number;
        measurements: number;
        handovers: number;
        achievementsEarned: number;
      };
      growth: {
        specimenId: string;
        name: string;
        from: string;
        until: string;
        growth: number;
        ratePerYear: number;
      } | null;
      photos: {
        specimenId: string;
        name: string;
        first: YearPhoto;
        last: YearPhoto;
        urls: { first: string; last: string };
      } | null;
    };

/** The year in review of a calendar year (US-ACH-07); without `year` the running year. `{ calmMode: true }` hides it. */
export function loadYear(
  api: string,
  token: string,
  year: number | null,
  fetchFn: typeof fetch = fetch,
): Promise<Response<YearAnswer>> {
  const query = `timeZone=${encodeURIComponent(currentTimeZone())}${year === null ? "" : `&year=${year}`}`;
  return call<YearAnswer>(fetchFn, `${api}/achievements/year?${query}`, token);
}

import type { Pool } from "pg";
import {
  beginAsApplicationRole,
  poolLimits,
  settleTransaction,
  type Settled,
} from "../kernel/index.ts";
import { findSpecimenOn, repotOn } from "../collection/index.ts";
import { currentPotOn, freePotsOn, placePotOn } from "./pot-placement.ts";

/**
 * The transaction of a repot with a pot (US-BES-04, US-BES-19, DM-EQU-06): the repot of the plant and its placement run
 * in one transaction as the caller (ADR 0012, the handover pattern). `work` decides whether it commits; a refused step
 * rolls back both. The steps are the adapters' functions on the connection, so the core decides what they mean.
 */
export class PotRepotPostgres {
  constructor(private readonly pool: Pool) {}

  async run<T>(
    userId: string,
    work: (steps: {
      readonly specimens: {
        find: (owner: string, id: string) => Promise<Awaited<ReturnType<typeof findSpecimenOn>>>;
        repot: (
          owner: string,
          id: string,
          date: string | null,
          chosenDate: string | null,
        ) => ReturnType<typeof repotOn> extends Promise<infer R> ? Promise<R> : never;
      };
      readonly pots: {
        place: (
          owner: string,
          specimenId: string,
          potId: string | null,
          day: string,
        ) => ReturnType<typeof placePotOn> extends Promise<infer R> ? Promise<R> : never;
        currentPot: (owner: string, specimenId: string) => ReturnType<typeof currentPotOn>;
        freePots: (owner: string) => ReturnType<typeof freePotsOn>;
      };
    }) => Promise<Settled<T>>,
  ): Promise<T> {
    return settleTransaction(
      this.pool,
      (client) =>
        beginAsApplicationRole(client, poolLimits(this.pool), [["app.account_id", userId]]),
      (client) =>
        work({
          specimens: {
            find: (_owner, id) => findSpecimenOn(client, id),
            repot: (owner, id, date, chosenDate) =>
              repotOn(client, owner, id, { date, chosenDate }),
          },
          pots: {
            place: (owner, specimenId, potId, day) =>
              placePotOn(client, owner, { specimenId, potId, day }),
            currentPot: (_owner, specimenId) => currentPotOn(client, specimenId),
            freePots: () => freePotsOn(client),
          },
        }),
    );
  }
}

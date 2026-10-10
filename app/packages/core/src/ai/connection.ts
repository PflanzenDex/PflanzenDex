// The connection of an AI client to one account (US-KI-07, DM-KI-01, KI-R6, KI-R8). The sign-in service (E-03) runs the
// OAuth approval; the app keeps the rights the keeper allowed, enforces them on every call and lets the keeper revoke.
import {
  appError,
  choiceField,
  defineOperation,
  failed,
  idField,
  ok,
  shape,
  type Result,
} from "../kernel";
import {
  AI_RIGHTS,
  AI_SCOPES,
  DEFAULT_AI_RIGHTS,
  lowerOf,
  rankOf,
  rightsOfScope,
  type AiRights,
} from "./rights";

export interface AiConnection {
  readonly id: string;
  /** The OAuth client of the AI client (`azp` of the token); with `accountId` it identifies the connection. */
  readonly clientId: string;
  readonly clientName: string;
  /** What the keeper allows (the ceiling); the token can only narrow it further. */
  readonly rights: AiRights;
  /** A higher right the client asked for with a token (step-up) and the keeper has not confirmed yet. */
  readonly requestedRights: AiRights | null;
  readonly createdAt: string;
  readonly lastUse: string | null;
  readonly revokedAt: string | null;
}

/** Port: connections of the own account only (P-04); every call runs as that account. */
export interface ConnectionStore {
  /** The newest connection of this client (active or revoked), or `null`. */
  latest(userId: string, clientId: string): Promise<AiConnection | null>;
  create(
    userId: string,
    input: { clientId: string; clientName: string; rights: AiRights },
    now: Date,
  ): Promise<AiConnection>;
  /** Records the use and the right the client's token asked for beyond the allowed one. */
  touch(userId: string, id: string, now: Date, requested: AiRights | null): Promise<void>;
  /** Newest first, revoked ones included (P-10: a revocation stays visible). */
  list(userId: string): Promise<readonly AiConnection[]>;
  /** Sets the allowed right of an active connection and clears a request the new right covers; `null` if none. */
  setRights(userId: string, id: string, rights: AiRights): Promise<AiConnection | null>;
  /** `unknown` for a foreign or unknown id; revoking twice changes nothing (`already`). */
  revoke(userId: string, id: string, now: Date): Promise<"revoked" | "already" | "unknown">;
}

export interface ConnectionDependencies {
  readonly connections: ConnectionStore;
}

export interface ClientCall {
  readonly userId: string;
  readonly clientId: string;
  readonly clientName: string;
  /** The `scope` claim of the verified access token. */
  readonly scope: unknown;
  /** The right the called operation needs (`rightNeeded`). */
  readonly needs: AiRights;
  readonly now: Date;
}

export interface Authorized {
  readonly connection: AiConnection;
  /** What the call may do: the lower of the allowed right and the right of the token (KI-R8). */
  readonly rights: AiRights;
}

/**
 * Admits a call of an AI client for the account of its token (KI-R6, KI-R8). The first call of a client creates the
 * connection with at most the default right "create drafts". A revoked connection is rejected for good, also for a
 * refresh token that is still valid; the keeper has to allow the client again. A token that carries more than the
 * keeper allowed creates a request the keeper confirms in the app (step-up): never more is allowed silently. If the
 * effective right is below what the operation needs, the call fails with `ai.scope_insufficient` and names the scope.
 */
export async function authorizeClient(
  deps: ConnectionDependencies,
  call: ClientCall,
): Promise<Result<Authorized>> {
  const tokenRights = rightsOfScope(call.scope);
  if (tokenRights === null) return failed(appError("ai.scope_insufficient"));
  const { connections } = deps;
  let connection = await connections.latest(call.userId, call.clientId);
  if (connection?.revokedAt) return failed(appError("ai.connection_revoked"));
  if (!connection)
    connection = await connections.create(
      call.userId,
      {
        clientId: call.clientId,
        clientName: call.clientName,
        rights: lowerOf(tokenRights, DEFAULT_AI_RIGHTS),
      },
      call.now,
    );
  const requested = rankOf(tokenRights) > rankOf(connection.rights) ? tokenRights : null;
  await connections.touch(call.userId, connection.id, call.now, requested);
  const rights = lowerOf(connection.rights, tokenRights);
  if (rankOf(rights) < rankOf(call.needs))
    return failed(
      appError("ai.scope_insufficient", {
        data: { scope: AI_SCOPES[call.needs], needs: call.needs },
      }),
    );
  return ok({ connection: { ...connection, requestedRights: requested }, rights });
}

/** The connections of the account for "Connected AI clients": name, rights, since, last use (US-KI-07). */
export const aiConnections = (deps: ConnectionDependencies, userId: string) =>
  deps.connections.list(userId);

const idOnly = shape({ id: idField("id") });
const rightsInput = shape({ id: idField("id"), rights: choiceField("rights", AI_RIGHTS) });

/**
 * Changes what a connection may do, also to confirm a request for a higher right (step-up). An unknown, foreign or
 * revoked connection answers `ai.connection_not_found`.
 */
export const aiSetRights = (deps: ConnectionDependencies) =>
  defineOperation({
    name: "ai.set_rights",
    schema: rightsInput,
    run: async ({ userId }, input) => {
      const changed = await deps.connections.setRights(userId, input.id, input.rights);
      return changed ? ok(changed) : failed(appError("ai.connection_not_found"));
    },
  });

/** Revokes a connection; it takes effect with the next call (KI-R8). Repeating it changes nothing. */
export const aiRevoke = (deps: ConnectionDependencies, now: () => Date = () => new Date()) =>
  defineOperation({
    name: "ai.revoke",
    schema: idOnly,
    run: async ({ userId }, input) => {
      const r = await deps.connections.revoke(userId, input.id, now());
      return r === "unknown"
        ? failed(appError("ai.connection_not_found"))
        : ok({ revoked: r === "revoked" });
    },
  });

/**
 * Lets a revoked client connect again: a new connection with the default right, the old one stays as history. Only the
 * newest connection of the client counts; an active one is not replaced (`ai.connection_active`).
 */
export const aiAllowAgain = (deps: ConnectionDependencies, now: () => Date = () => new Date()) =>
  defineOperation({
    name: "ai.allow_again",
    schema: idOnly,
    run: async ({ userId }, input) => {
      const known = (await deps.connections.list(userId)).find((c) => c.id === input.id);
      if (!known) return failed(appError("ai.connection_not_found"));
      const newest = await deps.connections.latest(userId, known.clientId);
      if (!known.revokedAt || (newest && !newest.revokedAt))
        return failed(appError("ai.connection_active"));
      return ok(
        await deps.connections.create(
          userId,
          { clientId: known.clientId, clientName: known.clientName, rights: DEFAULT_AI_RIGHTS },
          now(),
        ),
      );
    },
  });

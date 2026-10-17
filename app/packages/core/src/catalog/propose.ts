import {
  defineOperation,
  appError,
  failed,
  ok,
  identifierField,
  idField,
  shape,
  choiceField,
} from "../kernel";
import { isReviewer } from "./permissions";
import { PROPOSAL_STATUS, type ReviewStore } from "./types";

const objectFields = {
  objectKind: identifierField("objectKind", 40),
  objectId: idField("objectId"),
};

const proposalSchema = shape({ ...objectFields, status: choiceField("status", PROPOSAL_STATUS) });
const kuratierSchema = shape(objectFields);

/** Every signed-in user may propose (FR-BES-02); the proposal stays private until a reviewer decides. */
export const catalogPropose = (store: ReviewStore) =>
  defineOperation({
    name: "catalog.propose",
    schema: proposalSchema,
    run: async (context, input) => {
      const r = await store.create(context.userId, input);
      return r === "present" ? failed(appError("review.already_exists")) : ok(r);
    },
  });

/** Operator batch: immediately visible and marked `curated` (FR-BES-11); reviewers only. */
export const catalogCurate = (store: ReviewStore) =>
  defineOperation({
    name: "catalog.curate",
    schema: kuratierSchema,
    authorized: isReviewer(store),
    run: async (context, input) => {
      const r = await store.create(context.userId, { ...input, status: "curated" });
      return r === "present" ? failed(appError("review.already_exists")) : ok(r);
    },
  });
